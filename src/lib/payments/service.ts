import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  idempotencyKeys,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryReservations,
  mediaAssets,
  outboxEvents,
  paymentProofUploadIntents,
  paymentSubmissions,
  payments,
} from "@/db/schema";
import { getCheckoutConfig } from "@/lib/checkout/config";
import { generateUuidV7 } from "@/db/utils/uuid";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";
import {
  bestEffortDeleteR2Object,
  generateProofUploadPresignedPutUrl,
  MAX_PROOF_FILE_SIZE_BYTES,
  validateAndFinalizeStagingProof,
} from "@/lib/storage/proof-upload";
import { UPLOAD_INTENT_TTL_SECONDS } from "./constants";
import { computePaymentSubmissionFingerprint } from "./crypto";
import { resolveAuthorizedPayment } from "./authority";

export type CreateUploadIntentInput = {
  orderNumber: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
};

export type CreateUploadIntentResult =
  | {
      success: true;
      uploadIntentId: string;
      presignedPutUrl: string;
      expiresInSeconds: number;
    }
  | { success: false; code: string; error: string };

/**
 * Creates an authorized upload intent and returns a pre-signed PUT URL for uploading a staging payment proof.
 */
export async function createPaymentProofUploadIntent(
  input: CreateUploadIntentInput
): Promise<CreateUploadIntentResult> {
  const authResult = await resolveAuthorizedPayment(input.orderNumber);
  if (!authResult.authorized) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const { payment, authorityBindingDigest } = authResult;

  // Validate Payment Eligibility
  const now = new Date();
  const isInitial = payment.status === "UNPAID" && !payment.resubmissionGraceExpiresAt;
  const isResubmission =
    payment.status === "UNPAID" &&
    payment.resubmissionGraceExpiresAt !== null &&
    payment.resubmissionGraceExpiresAt > now;

  if (!isInitial && !isResubmission) {
    return {
      success: false,
      code: "INVALID_PAYMENT_STATE",
      error: "El estado actual del pedido no permite adjuntar nuevos comprobantes.",
    };
  }

  // Validate Declared MIME and Size
  const mime = input.declaredMimeType.trim().toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    return {
      success: false,
      code: "INVALID_MIME_TYPE",
      error: "Solo se aceptan comprobantes en formato JPG, PNG o WebP.",
    };
  }

  if (input.declaredSizeBytes <= 0 || input.declaredSizeBytes > MAX_PROOF_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: "INVALID_FILE_SIZE",
      error: "El tamaño del comprobante debe ser menor o igual a 5MB.",
    };
  }

  // Check Private R2 Storage Capability
  const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
  if (!storageCap.isAvailable) {
    return {
      success: false,
      code: "STORAGE_UNAVAILABLE",
      error: "El servicio de carga de comprobantes no está disponible temporalmente.",
    };
  }

  const uploadIntentId = generateUuidV7();
  const stagingKey = `payment-proofs/staging/${payment.id}/${uploadIntentId}`;
  const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1000);

  // Abandon previous PENDING intents for this payment/authority to enforce one-active bound
  await db
    .update(paymentProofUploadIntents)
    .set({ status: "ABANDONED" })
    .where(
      and(
        eq(paymentProofUploadIntents.paymentId, payment.id),
        eq(paymentProofUploadIntents.authorityBindingDigest, authorityBindingDigest),
        eq(paymentProofUploadIntents.status, "PENDING")
      )
    );

  // Insert upload intent row
  await db.insert(paymentProofUploadIntents).values({
    id: uploadIntentId,
    paymentId: payment.id,
    authorityBindingDigest,
    stagingObjectKey: stagingKey,
    declaredMimeType: mime,
    declaredSizeBytes: input.declaredSizeBytes,
    status: "PENDING",
    expiresAt,
  });

  // Generate Pre-Signed PUT URL
  let presignedPutUrl: string;
  try {
    presignedPutUrl = await generateProofUploadPresignedPutUrl({
      s3Client: storageCap.client,
      bucketName: storageCap.bucketName,
      stagingKey,
      contentType: mime,
      expiresInSeconds: 60, // 60-second technical TTL for PUT
    });
  } catch {
    return {
      success: false,
      code: "STORAGE_ERROR",
      error: "Error al generar enlace seguro de carga.",
    };
  }

  return {
    success: true,
    uploadIntentId,
    presignedPutUrl,
    expiresInSeconds: 60,
  };
}

export type SubmitPaymentProofInput = {
  orderNumber: string;
  submissionAttemptId: string;
  operationCode: string;
  uploadIntentId?: string | null;
  customerNotes?: string | null;
  clientIp?: string | null;
};

export type SubmitPaymentProofResult =
  | {
      success: true;
      paymentStatus: "SUBMITTED";
      attemptNumber: number;
      isLate: boolean;
      replayed: boolean;
    }
  | {
      success: false;
      code:
        | "NOT_AVAILABLE"
        | "INVALID_INPUT"
        | "IDEMPOTENCY_CONFLICT"
        | "INVALID_PAYMENT_STATE"
        | "PROOF_VALIDATION_FAILED"
        | "SYSTEM_ERROR";
      error: string;
    };

/**
 * Validates operation code string conservatively in a provider-neutral manner.
 */
export function validateOperationCode(
  raw: string
): { valid: true; normalized: string } | { valid: false; error: string } {
  if (typeof raw !== "string") {
    return { valid: false, error: "El código de operación debe ser una cadena de texto." };
  }

  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { valid: false, error: "El código de operación debe tener entre 1 y 50 caracteres." };
  }

  // Reject ASCII control characters and dangerous invisible Unicode separators
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: "El código de operación contiene caracteres inválidos." };
  }

  return { valid: true, normalized: trimmed };
}

/**
 * Submits manual payment proof (operation code + optional voucher) for an authorized Order.
 */
export async function submitPaymentProof(
  input: SubmitPaymentProofInput
): Promise<SubmitPaymentProofResult> {
  // 1. Validate Operation Code
  const opValidation = validateOperationCode(input.operationCode);
  if (!opValidation.valid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: opValidation.error,
    };
  }
  const normalizedOpCode = opValidation.normalized;

  // 2. Validate Submission Attempt ID format
  if (!input.submissionAttemptId || input.submissionAttemptId.length < 16) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Identificador de intento de envío inválido.",
    };
  }

  // 3. Resolve Authority & Order/Payment
  const authResult = await resolveAuthorizedPayment(input.orderNumber);
  if (!authResult.authorized) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }
  const { order, payment, authorityBindingDigest } = authResult;

  const configResult = getCheckoutConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error de configuración de pagos.",
    };
  }
  const hmacSecret = configResult.config.hmacSecret;

  // 4. Derive Namespaced Idempotency Key & Fingerprint
  const namespacedKey = `PAYMENT_SUBMISSION:${input.submissionAttemptId}`;
  const requestFingerprint = computePaymentSubmissionFingerprint(
    {
      paymentId: payment.id,
      normalizedOpCode,
      uploadIntentId: input.uploadIntentId ?? null,
      authorityBindingDigest,
    },
    hmacSecret
  );

  // 5. Fast Pre-R2 Committed-Idempotency Check
  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingIdempotency) {
    if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
      return {
        success: false,
        code: "NOT_AVAILABLE",
        error: "Pedido no disponible.",
      };
    }
    if (existingIdempotency.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia: el contenido del envío ha cambiado.",
      };
    }
    if (existingIdempotency.responsePayload) {
      const payload = existingIdempotency.responsePayload as {
        paymentStatus: "SUBMITTED";
        attemptNumber: number;
        isLate: boolean;
      };
      return {
        success: true,
        paymentStatus: "SUBMITTED",
        attemptNumber: payload.attemptNumber ?? 1,
        isLate: payload.isLate ?? false,
        replayed: true,
      };
    }
  }

  // 6. If Proof Provided: Server-Side Validation & Candidate Final Copy (Outside DB Transaction)
  let finalizedProof: {
    finalKey: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    fileSizeBytes: number;
    checksumSha256: string;
  } | null = null;
  let candidateFinalKeyToDeleteOnError: string | null = null;
  let stagingKeyToCleanOnSuccess: string | null = null;

  if (input.uploadIntentId) {
    const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
    if (!storageCap.isAvailable) {
      return {
        success: false,
        code: "PROOF_VALIDATION_FAILED",
        error: "Almacenamiento de comprobantes no disponible.",
      };
    }

    const now = new Date();
    const [uploadIntent] = await db
      .select()
      .from(paymentProofUploadIntents)
      .where(
        and(
          eq(paymentProofUploadIntents.id, input.uploadIntentId),
          eq(paymentProofUploadIntents.paymentId, payment.id),
          eq(paymentProofUploadIntents.authorityBindingDigest, authorityBindingDigest),
          eq(paymentProofUploadIntents.status, "PENDING"),
          gt(paymentProofUploadIntents.expiresAt, now)
        )
      )
      .limit(1);

    if (!uploadIntent) {
      return {
        success: false,
        code: "PROOF_VALIDATION_FAILED",
        error: "La sesión de carga del comprobante expiró o es inválida.",
      };
    }

    stagingKeyToCleanOnSuccess = uploadIntent.stagingObjectKey;

    const validationResult = await validateAndFinalizeStagingProof({
      s3Client: storageCap.client,
      bucketName: storageCap.bucketName,
      paymentId: payment.id,
      uploadIntentId: uploadIntent.id,
      stagingKey: uploadIntent.stagingObjectKey,
    });

    if (!validationResult.success) {
      return {
        success: false,
        code: "PROOF_VALIDATION_FAILED",
        error: validationResult.error,
      };
    }

    finalizedProof = {
      finalKey: validationResult.finalKey,
      mimeType: validationResult.mimeType,
      fileSizeBytes: validationResult.fileSizeBytes,
      checksumSha256: validationResult.checksumSha256,
    };
    candidateFinalKeyToDeleteOnError = validationResult.finalKey;
  }

  // 7. Execute PostgreSQL ACID Financial Transaction
  try {
    const transactionResult = await db.transaction(async (tx) => {
      // Step A: Acquire advisory lock on the attempt ID
      const lockKey = createHmacAdvisoryLockKey(namespacedKey);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      // Step B: Re-check idempotency under lock
      const [lockedIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
        .limit(1);

      if (lockedIdempotency) {
        if (lockedIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "NOT_AVAILABLE" as const,
            error: "Pedido no disponible.",
          };
        }
        if (lockedIdempotency.requestFingerprint !== requestFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error: "Conflicto de idempotencia: el contenido del envío ha cambiado.",
          };
        }
        if (lockedIdempotency.responsePayload) {
          const payload = lockedIdempotency.responsePayload as {
            paymentStatus: "SUBMITTED";
            attemptNumber: number;
            isLate: boolean;
          };
          return {
            success: true as const,
            paymentStatus: "SUBMITTED" as const,
            attemptNumber: payload.attemptNumber ?? 1,
            isLate: payload.isLate ?? false,
            replayed: true as const,
          };
        }
      }

      // Step C: Lock Payment row
      const [lockedPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for("update")
        .limit(1);

      if (!lockedPayment) {
        return {
          success: false as const,
          code: "NOT_AVAILABLE" as const,
          error: "Pedido no disponible.",
        };
      }

      const txNow = new Date();
      const isInitialEligible =
        lockedPayment.status === "UNPAID" && !lockedPayment.resubmissionGraceExpiresAt;
      const isResubmissionEligible =
        lockedPayment.status === "UNPAID" &&
        lockedPayment.resubmissionGraceExpiresAt !== null &&
        lockedPayment.resubmissionGraceExpiresAt > txNow;

      if (!isInitialEligible && !isResubmissionEligible) {
        return {
          success: false as const,
          code: "INVALID_PAYMENT_STATE" as const,
          error: "El estado actual del pago no permite registrar envíos.",
        };
      }

      // Step D: Lock all inventory reservations and items for the order
      const reservations = await tx
        .select()
        .from(inventoryReservations)
        .where(eq(inventoryReservations.orderId, order.id))
        .orderBy(asc(inventoryReservations.id));

      let isLate = false;
      for (const res of reservations) {
        if (res.status === "RELEASED" || (res.status === "ACTIVE" && res.expiresAt <= txNow)) {
          isLate = true;
          break;
        }
      }

      // Step E: Inventory Reservation & Balance State Transitions
      if (isLate) {
        // Coherent whole-order release for any still-ACTIVE reservations on touch
        for (const res of reservations) {
          if (res.status === "ACTIVE") {
            // Lock inventory item row
            const [item] = await tx
              .select()
              .from(inventoryItems)
              .where(eq(inventoryItems.id, res.inventoryItemId))
              .for("update")
              .limit(1);

            if (item) {
              if (item.quantityReserved < res.quantity) {
                throw new Error(
                  `[INVENTORY_SAFETY] Quantity reserved underflow on item ${item.id}`
                );
              }
              const newReserved = item.quantityReserved - res.quantity;
              await tx
                .update(inventoryItems)
                .set({
                  quantityReserved: newReserved,
                  updatedAt: txNow,
                })
                .where(eq(inventoryItems.id, item.id));

              await tx.insert(inventoryLedgerEntries).values({
                id: generateUuidV7(),
                inventoryItemId: item.id,
                movementType: "RESERVATION_EXPIRED",
                onHandDelta: 0,
                reservedDelta: -res.quantity,
                allocatedDelta: 0,
                quantityOnHandAfter: item.quantityOnHand,
                quantityReservedAfter: newReserved,
                quantityAllocatedAfter: item.quantityAllocated,
                referenceType: "ORDER",
                referenceId: order.id,
                actorId: "SYSTEM",
              });
            }

            await tx
              .update(inventoryReservations)
              .set({
                status: "RELEASED",
                updatedAt: txNow,
              })
              .where(eq(inventoryReservations.id, res.id));
          }
        }
      } else if (isInitialEligible) {
        // Normal unexpired initial submission -> VERIFICATION_HOLD
        await tx
          .update(inventoryReservations)
          .set({
            status: "VERIFICATION_HOLD",
            updatedAt: txNow,
          })
          .where(
            and(
              eq(inventoryReservations.orderId, order.id),
              eq(inventoryReservations.status, "ACTIVE")
            )
          );
      }
      // Note: If isResubmissionEligible and not late, reservations already remain in VERIFICATION_HOLD

      // Step F: Create MediaAsset and Finalize Upload Intent if proof used
      let proofMediaId: string | null = null;
      if (finalizedProof && input.uploadIntentId) {
        proofMediaId = generateUuidV7();
        await tx.insert(mediaAssets).values({
          id: proofMediaId,
          objectKey: finalizedProof.finalKey,
          securityClass: "PRIVATE_PAYMENT_PROOF",
          mediaType: "IMAGE",
          mimeType: finalizedProof.mimeType,
          fileSizeBytes: finalizedProof.fileSizeBytes,
          checksumSha256: finalizedProof.checksumSha256,
        });

        await tx
          .update(paymentProofUploadIntents)
          .set({
            status: "FINALIZED",
            finalizedAt: txNow,
          })
          .where(eq(paymentProofUploadIntents.id, input.uploadIntentId));
      }

      // Step G: Derive attempt number under row lock
      const [attemptRecord] = await tx
        .select({
          maxAttempt: sql<number>`COALESCE(MAX(${paymentSubmissions.attemptNumber}), 0)`,
        })
        .from(paymentSubmissions)
        .where(eq(paymentSubmissions.paymentId, lockedPayment.id));

      const nextAttemptNumber = (attemptRecord?.maxAttempt ?? 0) + 1;
      const submissionId = generateUuidV7();

      // Step H: Insert PaymentSubmission
      await tx.insert(paymentSubmissions).values({
        id: submissionId,
        paymentId: lockedPayment.id,
        attemptNumber: nextAttemptNumber,
        operationCode: normalizedOpCode,
        proofMediaId,
        customerNotes: input.customerNotes ? input.customerNotes.trim() : null,
        isLate,
        submittedAt: txNow,
        ipAddress: input.clientIp ?? null,
      });

      // Step I: Update Payment status to SUBMITTED
      await tx
        .update(payments)
        .set({
          status: "SUBMITTED",
          updatedAt: txNow,
        })
        .where(eq(payments.id, lockedPayment.id));

      // Step J: Insert PaymentSubmitted OutboxEvent
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "PaymentSubmitted",
        eventVersion: 1,
        aggregateType: "Payment",
        aggregateId: lockedPayment.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: lockedPayment.id,
          submissionId,
          attemptNumber: nextAttemptNumber,
          isLate,
          submittedAt: txNow.toISOString(),
        },
        status: "PENDING",
      });

      // Step K: Insert Idempotency Key Record
      const responsePayload = {
        paymentStatus: "SUBMITTED" as const,
        attemptNumber: nextAttemptNumber,
        isLate,
      };

      const idempotencyExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60m TTL
      await tx.insert(idempotencyKeys).values({
        id: generateUuidV7(),
        idempotencyKey: namespacedKey,
        operationType: "PAYMENT_SUBMISSION",
        authorityBindingDigest,
        sourceCartId: null, // Nullable for PAYMENT_SUBMISSION per migration 0010
        requestFingerprint,
        targetAggregateId: lockedPayment.id,
        responsePayload,
        expiresAt: idempotencyExpiresAt,
      });

      // Clear candidate delete key on successful commit so we don't delete committed evidence
      candidateFinalKeyToDeleteOnError = null;

      return {
        success: true as const,
        paymentStatus: "SUBMITTED" as const,
        attemptNumber: nextAttemptNumber,
        isLate,
        replayed: false as const,
      };
    });

    // Step L: Post-commit staging cleanup
    if (transactionResult.success && stagingKeyToCleanOnSuccess) {
      const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
      if (storageCap.isAvailable) {
        await bestEffortDeleteR2Object({
          s3Client: storageCap.client,
          bucketName: storageCap.bucketName,
          key: stagingKeyToCleanOnSuccess,
        });
      }
    }

    return transactionResult;
  } catch (_error) {
    // If transaction failed and we copied a candidate final object, best-effort delete it
    if (candidateFinalKeyToDeleteOnError) {
      const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
      if (storageCap.isAvailable) {
        await bestEffortDeleteR2Object({
          s3Client: storageCap.client,
          bucketName: storageCap.bucketName,
          key: candidateFinalKeyToDeleteOnError,
        });
      }
    }

    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error interno al procesar el comprobante de pago.",
    };
  }
}

function createHmacAdvisoryLockKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
