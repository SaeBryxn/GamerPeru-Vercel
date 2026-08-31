import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
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
import { getPaymentSubmissionConfig } from "./config";
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
 *
 * Invariants:
 * 1. Serialized Payment Boundary: SELECT FOR UPDATE on Payment row serializes concurrent upload intent requests.
 * 2. Exactly One PENDING Intent: Atomically marks existing PENDING intents as ABANDONED before inserting the new intent.
 * 3. Preserves Best-Effort Cleanup Seam: Replaced staging keys are cleaned up asynchronously post-transaction.
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

  let abandonedStagingKeys: string[] = [];

  try {
    const txResult = await db.transaction(async (tx) => {
      // Step A: Lock Payment row to serialize concurrent upload intent requests for this Payment
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
      const isInitial =
        lockedPayment.status === "UNPAID" && !lockedPayment.resubmissionGraceExpiresAt;
      const isResubmission =
        lockedPayment.status === "UNPAID" &&
        lockedPayment.resubmissionGraceExpiresAt !== null &&
        lockedPayment.resubmissionGraceExpiresAt > txNow;

      if (!isInitial && !isResubmission) {
        return {
          success: false as const,
          code: "INVALID_PAYMENT_STATE" as const,
          error: "El estado actual del pedido no permite adjuntar nuevos comprobantes.",
        };
      }

      // Step B: Query existing PENDING intents to collect abandoned staging keys for cleanup
      const existingPending = await tx
        .select({ stagingObjectKey: paymentProofUploadIntents.stagingObjectKey })
        .from(paymentProofUploadIntents)
        .where(
          and(
            eq(paymentProofUploadIntents.paymentId, lockedPayment.id),
            eq(paymentProofUploadIntents.authorityBindingDigest, authorityBindingDigest),
            eq(paymentProofUploadIntents.status, "PENDING")
          )
        )
        .for("update");

      abandonedStagingKeys = existingPending.map((i) => i.stagingObjectKey);

      // Step C: Atomically mark previous PENDING intents as ABANDONED
      if (existingPending.length > 0) {
        await tx
          .update(paymentProofUploadIntents)
          .set({ status: "ABANDONED" })
          .where(
            and(
              eq(paymentProofUploadIntents.paymentId, lockedPayment.id),
              eq(paymentProofUploadIntents.authorityBindingDigest, authorityBindingDigest),
              eq(paymentProofUploadIntents.status, "PENDING")
            )
          );
      }

      // Step D: Insert exactly one new PENDING intent under the Payment row lock
      await tx.insert(paymentProofUploadIntents).values({
        id: uploadIntentId,
        paymentId: lockedPayment.id,
        authorityBindingDigest,
        stagingObjectKey: stagingKey,
        declaredMimeType: mime,
        declaredSizeBytes: input.declaredSizeBytes,
        status: "PENDING",
        expiresAt,
      });

      return { success: true as const };
    });

    if (!txResult.success) {
      return txResult;
    }
  } catch (_err) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error interno al crear sesión de carga de comprobante.",
    };
  }

  // Generate Pre-Signed PUT URL
  let presignedPutUrl: string;
  try {
    presignedPutUrl = await generateProofUploadPresignedPutUrl({
      s3Client: storageCap.client,
      bucketName: storageCap.bucketName,
      stagingKey,
      contentType: mime,
      expiresInSeconds: 60,
    });
  } catch {
    return {
      success: false,
      code: "STORAGE_ERROR",
      error: "Error al generar enlace seguro de carga.",
    };
  }

  // Best-effort cleanup seam for replaced abandoned staging keys
  if (abandonedStagingKeys.length > 0) {
    for (const key of abandonedStagingKeys) {
      bestEffortDeleteR2Object({
        s3Client: storageCap.client,
        bucketName: storageCap.bucketName,
        key,
      }).catch(() => {});
    }
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
        | "IDEMPOTENCY_EXPIRED"
        | "INVALID_PAYMENT_STATE"
        | "PROOF_VALIDATION_FAILED"
        | "SYSTEM_ERROR";
      error: string;
    };

/**
 * Validates operation code string conservatively in a provider-neutral manner.
 *
 * Invariants:
 * 1. Preserves leading zeros.
 * 2. Allows ordinary visible punctuation (-, /, #, ., _, :, etc.).
 * 3. Strictly rejects Unicode control (\p{Cc}), format/invisible/bidi (\p{Cf}), line separators (\p{Zl}), and paragraph separators (\p{Zp}).
 */
export function validateOperationCode(
  raw: string
): { valid: true; normalized: string } | { valid: false; error: string } {
  if (typeof raw !== "string") {
    return { valid: false, error: "El código de operación debe ser una cadena de texto." };
  }

  // Reject Unicode control (\p{Cc}), format/invisible/bidi/BOM (\p{Cf}), line separator (\p{Zl}), and paragraph separator (\p{Zp})
  // Test raw input directly so leading/trailing BOM or invisible characters are NOT silently stripped by trim
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(raw)) {
    return {
      valid: false,
      error: "El código de operación contiene caracteres invisibles o de control no permitidos.",
    };
  }

  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { valid: false, error: "El código de operación debe tener entre 1 y 50 caracteres." };
  }

  return { valid: true, normalized: trimmed };
}

/**
 * Submits manual payment proof (operation code + optional voucher) for an authorized Order.
 *
 * Invariants:
 * 1. Fast Pre-R2 Committed-Idempotency Check: Returns existing committed submission with ZERO R2 operations.
 * 2. Candidate Final R2 Ownership: Cleaned up if and only if this request copied candidate proof but transaction did not commit it.
 * 3. Lock Ordering: Advisory Lock -> Payment (FOR UPDATE) -> Reservations (id ASC, FOR UPDATE) -> InventoryItems (id ASC, FOR UPDATE).
 * 4. Deterministic Whole-Order Late Reconciliation: If any reservation expired/released, whole order is marked isLate=true. Expired reservations write RESERVATION_EXPIRED, unexpired write RESERVATION_RELEASED.
 * 5. Fail-Closed Idempotency TTL: Explicitly configured PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES with no production default.
 * 6. Privacy & Outbox Hygiene: Zero raw session tokens, customer PII, or operation codes leaked to Outbox events.
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

  // 4. Server Runtime Configuration
  const configResult = getPaymentSubmissionConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error de configuración de pagos.",
    };
  }
  const paymentConfig = configResult.config;

  // 5. Derive Namespaced Idempotency Key & Fingerprint
  const namespacedKey = `PAYMENT_SUBMISSION:${input.submissionAttemptId}`;
  const requestFingerprint = computePaymentSubmissionFingerprint(
    {
      paymentId: payment.id,
      normalizedOpCode,
      uploadIntentId: input.uploadIntentId ?? null,
      authorityBindingDigest,
    },
    paymentConfig.hmacSecret
  );

  // 6. Fast Pre-R2 Committed-Idempotency Check
  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);

  if (existingIdempotency) {
    const lookupNow = new Date();

    // 1. Authority Binding Check
    if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
      return {
        success: false,
        code: "NOT_AVAILABLE",
        error: "Pedido no disponible.",
      };
    }

    // 2. Expiration Check (Evaluated BEFORE fingerprint)
    if (existingIdempotency.expiresAt <= lookupNow) {
      return {
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error:
          "El intento anterior expiró. Actualiza el estado del pedido antes de intentarlo nuevamente.",
      };
    }

    // 3. Request Fingerprint Check
    if (existingIdempotency.requestFingerprint !== requestFingerprint) {
      return {
        success: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: "Conflicto de idempotencia: el contenido del envío ha cambiado.",
      };
    }

    // 4. Committed Replay Payload Check
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

  // 7. If Proof Provided: Server-Side Validation & Candidate Final Copy (Outside DB Transaction)
  let finalizedProof: {
    finalKey: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    fileSizeBytes: number;
    checksumSha256: string;
  } | null = null;
  let candidateFinalKey: string | null = null;
  let candidateBelongsToThisRequest = false;
  let candidateCommitted = false;
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
    candidateFinalKey = validationResult.finalKey;
    candidateBelongsToThisRequest = true;
    candidateCommitted = false;
  }

  // 8. Execute PostgreSQL ACID Financial Transaction
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
        const txNow = new Date();

        // 1. Authority Binding Check
        if (lockedIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "NOT_AVAILABLE" as const,
            error: "Pedido no disponible.",
          };
        }

        // 2. Expiration Check (Evaluated BEFORE fingerprint)
        if (lockedIdempotency.expiresAt <= txNow) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_EXPIRED" as const,
            error:
              "El intento anterior expiró. Actualiza el estado del pedido antes de intentarlo nuevamente.",
          };
        }

        // 3. Request Fingerprint Check
        if (lockedIdempotency.requestFingerprint !== requestFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error: "Conflicto de idempotencia: el contenido del envío ha cambiado.",
          };
        }

        // 4. Committed Replay Payload Check
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

      // Step D: Lock all inventory reservations in deterministic order (id ASC)
      const reservations = await tx
        .select()
        .from(inventoryReservations)
        .where(eq(inventoryReservations.orderId, order.id))
        .orderBy(asc(inventoryReservations.id))
        .for("update");

      let isLate = false;
      for (const res of reservations) {
        if (res.status === "RELEASED" || (res.status === "ACTIVE" && res.expiresAt <= txNow)) {
          isLate = true;
          break;
        }
      }

      // Step E: Inventory Reservation & Balance State Transitions
      if (isLate) {
        const activeReservations = reservations.filter((r) => r.status === "ACTIVE");
        if (activeReservations.length > 0) {
          // Lock ALL required inventory_items in ONE deterministic global order (id ASC)
          const uniqueItemIds = Array.from(
            new Set(activeReservations.map((r) => r.inventoryItemId))
          ).sort();

          const lockedItemsList = await tx
            .select()
            .from(inventoryItems)
            .where(inArray(inventoryItems.id, uniqueItemIds))
            .orderBy(asc(inventoryItems.id))
            .for("update");

          const itemsMap = new Map(lockedItemsList.map((item) => [item.id, item]));

          for (const res of activeReservations) {
            const item = itemsMap.get(res.inventoryItemId);
            if (!item) {
              throw new Error(`[INVENTORY_SAFETY] Item ${res.inventoryItemId} not found`);
            }

            if (item.quantityReserved < res.quantity) {
              throw new Error(
                `[INVENTORY_SAFETY] Quantity reserved underflow on item ${item.id}: available ${item.quantityReserved} < required ${res.quantity}`
              );
            }

            const newReserved = item.quantityReserved - res.quantity;
            item.quantityReserved = newReserved;

            await tx
              .update(inventoryItems)
              .set({
                quantityReserved: newReserved,
                updatedAt: txNow,
              })
              .where(eq(inventoryItems.id, item.id));

            // Expired condition: reservation elapsed on its own
            // Released condition: still unexpired reservation released solely for coherent whole-order late handling
            const movementType =
              res.expiresAt <= txNow ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED";

            await tx.insert(inventoryLedgerEntries).values({
              id: generateUuidV7(),
              inventoryItemId: item.id,
              movementType,
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

      // Step F: Create MediaAsset and Finalize Upload Intent if proof used (rechecked under lock)
      let proofMediaId: string | null = null;
      if (finalizedProof && input.uploadIntentId) {
        const [txUploadIntent] = await tx
          .select()
          .from(paymentProofUploadIntents)
          .where(
            and(
              eq(paymentProofUploadIntents.id, input.uploadIntentId),
              eq(paymentProofUploadIntents.paymentId, lockedPayment.id),
              eq(paymentProofUploadIntents.authorityBindingDigest, authorityBindingDigest),
              eq(paymentProofUploadIntents.status, "PENDING"),
              gt(paymentProofUploadIntents.expiresAt, txNow)
            )
          )
          .for("update")
          .limit(1);

        if (!txUploadIntent) {
          return {
            success: false as const,
            code: "PROOF_VALIDATION_FAILED" as const,
            error: "La sesión de carga del comprobante expiró o ya no es válida.",
          };
        }

        const expectedKeyPrefix = `payment-proofs/final/${lockedPayment.id}/${txUploadIntent.id}`;
        if (!finalizedProof.finalKey.startsWith(expectedKeyPrefix)) {
          return {
            success: false as const,
            code: "PROOF_VALIDATION_FAILED" as const,
            error: "Identificador de comprobante inconsistente.",
          };
        }

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
          .where(eq(paymentProofUploadIntents.id, txUploadIntent.id));
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
        ipAddress: null, // Preferred v1: store NULL
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

      const idempotencyExpiresAt = new Date(
        Date.now() + paymentConfig.idempotencyTtlMinutes * 60 * 1000
      );
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

      return {
        success: true as const,
        paymentStatus: "SUBMITTED" as const,
        attemptNumber: nextAttemptNumber,
        isLate,
        replayed: false as const,
      };
    });

    if (transactionResult.success && !transactionResult.replayed) {
      candidateCommitted = true;
    }

    return transactionResult;
  } catch (_error) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Error interno al procesar el comprobante de pago.",
    };
  } finally {
    // If a candidate final object was copied by this request but NOT committed, best-effort delete it
    if (candidateFinalKey && candidateBelongsToThisRequest && !candidateCommitted) {
      const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
      if (storageCap.isAvailable) {
        await bestEffortDeleteR2Object({
          s3Client: storageCap.client,
          bucketName: storageCap.bucketName,
          key: candidateFinalKey,
        });
      }
    }

    // If committed successfully with proof, clean up the staging object
    if (candidateCommitted && stagingKeyToCleanOnSuccess) {
      const storageCap = validatePrivateStorageCapability("PROOF_UPLOAD");
      if (storageCap.isAvailable) {
        await bestEffortDeleteR2Object({
          s3Client: storageCap.client,
          bucketName: storageCap.bucketName,
          key: stagingKeyToCleanOnSuccess,
        });
      }
    }
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
