import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  idempotencyKeys,
  inventoryReservations,
  orders,
  outboxEvents,
  paymentSubmissions,
  paymentVerifications,
  payments,
  refunds,
  type PaymentVerificationDecision,
} from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import {
  allocateOrderInventoryAfterPaymentApproval,
  reacquireOrderInventoryAfterLatePayment,
  type DbTransaction,
} from "@/lib/inventory/service";
import { validateUuid } from "@/lib/inventory/validation";
import { logger } from "@/lib/logger";
import {
  computeOrderAuthorityBindingDigest,
  createOrderAdvisoryLockKey,
} from "@/lib/orders/crypto";
import { applyTerminalPaymentRejectionConsequences } from "@/lib/orders/service";
import { validateRefundExternalReference } from "@/lib/orders/validation";
import { getPaymentVerificationConfig } from "./config";
import { computePaymentVerificationFingerprint } from "./crypto";

export const LATE_PAYMENT_STOCK_UNAVAILABLE_MESSAGE =
  "Sin stock disponible. Si recibiste los fondos, registra la devolución externa confirmada.";

const LATE_REFUND_REASON = "Pago tardío sin stock; operador declara reembolso externo completado";

const MAX_REASON_LENGTH = 255;
const MAX_NOTES_LENGTH = 2000;

type StaffContext = { authUserId: string; permissions: Set<string> };

export type PaymentVerificationFailureCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "NOT_AVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_EXPIRED"
  | "CLAIM_REQUIRED"
  | "CLAIMED_BY_OTHER"
  | "STALE_SUBMISSION"
  | "INVALID_PAYMENT_STATE"
  | "INVALID_ORDER_STATE"
  | "LATE_PAYMENT_STOCK_UNAVAILABLE"
  | "INVENTORY_STATE_CONFLICT"
  | "SYSTEM_ERROR";

export type PaymentVerificationFailure = {
  success: false;
  code: PaymentVerificationFailureCode;
  error: string;
};

export type ClaimPaymentVerificationResult =
  | {
      success: true;
      paymentId: string;
      claimedByAuthUserId: string;
      claimedAt: string;
      alreadyClaimed: boolean;
    }
  | PaymentVerificationFailure;

export type ReleasePaymentVerificationClaimResult =
  { success: true; paymentId: string } | PaymentVerificationFailure;

export type PaymentVerificationDecisionResult =
  | {
      success: true;
      verificationId: string;
      decision: PaymentVerificationDecision;
      paymentStatus: "PAID" | "UNPAID" | "REJECTED" | "REFUNDED";
      orderStatus: "CONFIRMED" | "PENDING" | "EXPIRED" | "CANCELLED" | "REFUNDED";
      resubmissionGraceExpiresAt: string | null;
      replayed: boolean;
    }
  | PaymentVerificationFailure;

export type ApprovePaymentInput = {
  paymentId: string;
  submissionId: string;
  verificationAttemptId: string;
  notes?: string | null;
};

export type RejectPaymentInput = {
  paymentId: string;
  submissionId: string;
  verificationAttemptId: string;
  mode: "RETRYABLE" | "TERMINAL";
  reason: string;
  notes?: string | null;
};

export type RecordLatePaymentRefundInput = {
  paymentId: string;
  submissionId: string;
  verificationAttemptId: string;
  externalRefundCompleted: boolean;
  externalReference: string;
  notes?: string | null;
};

/** Carries a failure out of a transaction so every write in it is rolled back. */
class VerificationAbort extends Error {
  constructor(readonly result: PaymentVerificationFailure) {
    super(result.code);
  }
}

let testVerificationTransactionHook:
  ((stage: "after_lock" | "before_commit") => Promise<void>) | null = null;

export function __setTestPaymentVerificationTransactionHook(
  hook: ((stage: "after_lock" | "before_commit") => Promise<void>) | null
) {
  if (process.env.NODE_ENV === "production") return;
  testVerificationTransactionHook = hook;
}

function fail(code: PaymentVerificationFailureCode, error: string): PaymentVerificationFailure {
  return { success: false, code, error };
}

async function resolveVerifierContext(): Promise<StaffContext | null> {
  const authContext = await getVerifiedAuthContext();
  if (
    authContext.status !== "READY" ||
    !authContext.authUserId ||
    !authContext.permissions.has("orders:verify")
  ) {
    return null;
  }
  return { authUserId: authContext.authUserId, permissions: authContext.permissions };
}

function normalizeFreeText(
  raw: string | null | undefined,
  maxLength: number,
  fieldLabel: string
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (raw === null || raw === undefined) return { valid: true, value: null };
  if (typeof raw !== "string") {
    return { valid: false, error: `${fieldLabel} debe ser texto.` };
  }
  // Newlines and tabs are legitimate in notes; other control and bidi characters are not.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\p{Cf}]/u.test(raw)) {
    return { valid: false, error: `${fieldLabel} contiene caracteres no permitidos.` };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: true, value: null };
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldLabel} no puede superar ${maxLength} caracteres.` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Takes a submitted payment for review (SUBMITTED -> VERIFYING) and assigns it to the caller.
 *
 * The claim is the collision guard: while a payment is VERIFYING only its claimant can decide it.
 * Claiming again as the same operator is a no-op success, so a double click is harmless.
 */
export async function claimPaymentVerification(input: {
  paymentId: string;
}): Promise<ClaimPaymentVerificationResult> {
  const staff = await resolveVerifierContext();
  if (!staff) {
    return fail("UNAUTHORIZED", "No tienes permisos para verificar pagos.");
  }

  const paymentIdCheck = validateUuid(input.paymentId, "paymentId");
  if (!paymentIdCheck.valid || !paymentIdCheck.normalized) {
    return fail("INVALID_INPUT", "Identificador de pago inválido.");
  }
  const paymentId = paymentIdCheck.normalized;

  try {
    return await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update")
        .limit(1);

      if (!payment) {
        return fail("NOT_AVAILABLE", "Pago no disponible.");
      }

      if (payment.status === "VERIFYING") {
        if (payment.verificationClaimedByAuthUserId === staff.authUserId) {
          return {
            success: true as const,
            paymentId,
            claimedByAuthUserId: staff.authUserId,
            claimedAt: (payment.verificationClaimedAt ?? new Date()).toISOString(),
            alreadyClaimed: true,
          };
        }
        return fail("CLAIMED_BY_OTHER", "Otro operador ya está revisando este pago.");
      }

      if (payment.status !== "SUBMITTED") {
        return fail("INVALID_PAYMENT_STATE", "Este pago no tiene un comprobante pendiente.");
      }

      const now = new Date();
      await tx
        .update(payments)
        .set({
          status: "VERIFYING",
          verificationClaimedByAuthUserId: staff.authUserId,
          verificationClaimedAt: now,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId));

      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: now,
        actorType: "ADMIN",
        actorId: staff.authUserId,
        action: "orders:claim_payment_verification",
        targetType: "Payment",
        targetId: paymentId,
        metadata: { orderId: payment.orderId },
      });

      return {
        success: true as const,
        paymentId,
        claimedByAuthUserId: staff.authUserId,
        claimedAt: now.toISOString(),
        alreadyClaimed: false,
      };
    });
  } catch (error) {
    logger.error({ event: "payment_verification_claim_failed", paymentId, err: error });
    return fail("SYSTEM_ERROR", "No se pudo tomar el pago para revisión.");
  }
}

/**
 * Returns a claimed payment to the queue (VERIFYING -> SUBMITTED).
 *
 * The claimant can always release; anyone else needs staff:manage, which is how a claim left
 * behind by an absent operator gets unstuck.
 */
export async function releasePaymentVerificationClaim(input: {
  paymentId: string;
}): Promise<ReleasePaymentVerificationClaimResult> {
  const staff = await resolveVerifierContext();
  if (!staff) {
    return fail("UNAUTHORIZED", "No tienes permisos para verificar pagos.");
  }

  const paymentIdCheck = validateUuid(input.paymentId, "paymentId");
  if (!paymentIdCheck.valid || !paymentIdCheck.normalized) {
    return fail("INVALID_INPUT", "Identificador de pago inválido.");
  }
  const paymentId = paymentIdCheck.normalized;

  try {
    return await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update")
        .limit(1);

      if (!payment) {
        return fail("NOT_AVAILABLE", "Pago no disponible.");
      }
      if (payment.status !== "VERIFYING") {
        return fail("INVALID_PAYMENT_STATE", "Este pago no está en revisión.");
      }

      const isClaimant = payment.verificationClaimedByAuthUserId === staff.authUserId;
      if (!isClaimant && !staff.permissions.has("staff:manage")) {
        return fail("CLAIMED_BY_OTHER", "Solo quien tomó el pago puede liberarlo.");
      }

      const now = new Date();
      await tx
        .update(payments)
        .set({
          status: "SUBMITTED",
          verificationClaimedByAuthUserId: null,
          verificationClaimedAt: null,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId));

      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: now,
        actorType: "ADMIN",
        actorId: staff.authUserId,
        action: "orders:release_payment_verification",
        targetType: "Payment",
        targetId: paymentId,
        metadata: {
          orderId: payment.orderId,
          previousClaimant: payment.verificationClaimedByAuthUserId,
          forced: !isClaimant,
        },
      });

      return { success: true as const, paymentId };
    });
  } catch (error) {
    logger.error({ event: "payment_verification_release_failed", paymentId, err: error });
    return fail("SYSTEM_ERROR", "No se pudo liberar el pago.");
  }
}

/**
 * Approves a claimed payment: PAID, order CONFIRMED, reserved stock allocated for good.
 *
 * A late submission already had its reservations released, so its stock is reacquired instead;
 * if that stock is gone the approval is refused and nothing is written. Funds received without
 * available stock must use the separately attested refund path.
 */
export async function approvePayment(
  input: ApprovePaymentInput
): Promise<PaymentVerificationDecisionResult> {
  const notes = normalizeFreeText(input.notes, MAX_NOTES_LENGTH, "Las notas");
  if (!notes.valid) return fail("INVALID_INPUT", notes.error);

  return decidePayment({
    paymentId: input.paymentId,
    submissionId: input.submissionId,
    verificationAttemptId: input.verificationAttemptId,
    decision: "APPROVED",
    reason: null,
    notes: notes.value,
  });
}

/**
 * Rejects a claimed payment.
 *
 * RETRYABLE: the voucher is unusable but funds may exist; the payment returns to UNPAID with a
 * resubmission window and the stock hold stays in place.
 * TERMINAL: funds were not received; the payment is REJECTED, the order cancelled and its stock
 * released.
 */
export async function rejectPayment(
  input: RejectPaymentInput
): Promise<PaymentVerificationDecisionResult> {
  if (input.mode !== "RETRYABLE" && input.mode !== "TERMINAL") {
    return fail("INVALID_INPUT", "Tipo de rechazo inválido.");
  }
  const reason = normalizeFreeText(input.reason, MAX_REASON_LENGTH, "El motivo");
  if (!reason.valid) return fail("INVALID_INPUT", reason.error);
  if (!reason.value) return fail("INVALID_INPUT", "Indica el motivo del rechazo.");

  const notes = normalizeFreeText(input.notes, MAX_NOTES_LENGTH, "Las notas");
  if (!notes.valid) return fail("INVALID_INPUT", notes.error);

  return decidePayment({
    paymentId: input.paymentId,
    submissionId: input.submissionId,
    verificationAttemptId: input.verificationAttemptId,
    decision: input.mode === "TERMINAL" ? "REJECTED_TERMINAL" : "REJECTED_RETRYABLE",
    reason: reason.value,
    notes: notes.value,
  });
}

export async function recordLatePaymentRefund(
  input: RecordLatePaymentRefundInput
): Promise<PaymentVerificationDecisionResult> {
  if (input.externalRefundCompleted !== true) {
    return fail("INVALID_INPUT", "Confirma que la devolución externa ya se completó.");
  }
  const reference = validateRefundExternalReference(input.externalReference);
  if (!reference.valid) return fail("INVALID_INPUT", reference.error);
  if (!reference.normalized) {
    return fail("INVALID_INPUT", "Ingresa la referencia de la devolución externa completada.");
  }
  const notes = normalizeFreeText(input.notes, MAX_NOTES_LENGTH, "Las notas");
  if (!notes.valid) return fail("INVALID_INPUT", notes.error);

  return decidePayment({
    paymentId: input.paymentId,
    submissionId: input.submissionId,
    verificationAttemptId: input.verificationAttemptId,
    decision: "APPROVED",
    reason: null,
    notes: notes.value,
    refundExternalReference: reference.normalized,
  });
}

type DecisionCommand = {
  paymentId: string;
  submissionId: string;
  verificationAttemptId: string;
  decision: PaymentVerificationDecision;
  reason: string | null;
  notes: string | null;
  refundExternalReference?: string;
};

type ReplayPayload = Omit<
  Extract<PaymentVerificationDecisionResult, { success: true }>,
  "success" | "replayed"
>;

async function decidePayment(command: DecisionCommand): Promise<PaymentVerificationDecisionResult> {
  const staff = await resolveVerifierContext();
  if (!staff) {
    return fail("UNAUTHORIZED", "No tienes permisos para verificar pagos.");
  }
  if (command.refundExternalReference && !staff.permissions.has("orders:manage")) {
    return fail("UNAUTHORIZED", "No tienes permisos para registrar reembolsos.");
  }

  const paymentIdCheck = validateUuid(command.paymentId, "paymentId");
  const submissionIdCheck = validateUuid(command.submissionId, "submissionId");
  if (
    !paymentIdCheck.valid ||
    !paymentIdCheck.normalized ||
    !submissionIdCheck.valid ||
    !submissionIdCheck.normalized
  ) {
    return fail("INVALID_INPUT", "Identificador de pago o comprobante inválido.");
  }
  if (
    typeof command.verificationAttemptId !== "string" ||
    command.verificationAttemptId.length < 16 ||
    command.verificationAttemptId.length > 100
  ) {
    return fail("INVALID_INPUT", "Identificador de intento inválido.");
  }
  const paymentId = paymentIdCheck.normalized;
  const submissionId = submissionIdCheck.normalized;

  const configResult = getPaymentVerificationConfig();
  if (!configResult.valid) {
    logger.error({ event: "payment_verification_config_invalid", error: configResult.error });
    return fail("SYSTEM_ERROR", "Error de configuración de pagos.");
  }
  const { hmacSecret, idempotencyTtlMinutes, resubmissionGraceHours } = configResult.config;

  const namespacedKey = `PAYMENT_VERIFICATION:${command.verificationAttemptId}`;
  const authorityBindingDigest = computeOrderAuthorityBindingDigest(
    { type: "STAFF", authUserId: staff.authUserId },
    hmacSecret
  );
  const requestFingerprint = computePaymentVerificationFingerprint(
    {
      paymentId,
      submissionId,
      decision: command.decision,
      normalizedReason: command.reason,
      normalizedNotes: command.notes,
      authorityBindingDigest,
      refundExternalReference: command.refundExternalReference,
    },
    hmacSecret
  );

  const checkIdempotency = (
    record: typeof idempotencyKeys.$inferSelect | undefined
  ): PaymentVerificationDecisionResult | null => {
    if (!record) return null;
    if (record.authorityBindingDigest !== authorityBindingDigest) {
      return fail("NOT_AVAILABLE", "Pago no disponible.");
    }
    if (record.expiresAt <= new Date()) {
      return fail("IDEMPOTENCY_EXPIRED", "El intento anterior expiró. Actualiza la página.");
    }
    if (record.requestFingerprint !== requestFingerprint) {
      return fail(
        "IDEMPOTENCY_CONFLICT",
        "Conflicto de idempotencia: la decisión enviada cambió respecto del intento original."
      );
    }
    if (record.responsePayload) {
      return { success: true, ...(record.responsePayload as ReplayPayload), replayed: true };
    }
    return null;
  };

  const [existingIdempotency] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
    .limit(1);
  const fastReplay = checkIdempotency(existingIdempotency);
  if (fastReplay) return fastReplay;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${createOrderAdvisoryLockKey(namespacedKey)})`
      );

      const [lockedIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, namespacedKey))
        .limit(1);
      const lockedReplay = checkIdempotency(lockedIdempotency);
      if (lockedReplay) return lockedReplay;

      // Global lock order shared with checkout and order management: Payment -> Order -> stock.
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update")
        .limit(1);
      if (!payment) {
        return fail("NOT_AVAILABLE", "Pago no disponible.");
      }

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .for("update")
        .limit(1);
      if (!order) {
        return fail("NOT_AVAILABLE", "Pago no disponible.");
      }

      if (testVerificationTransactionHook) {
        await testVerificationTransactionHook("after_lock");
      }

      if (payment.status === "SUBMITTED") {
        return fail("CLAIM_REQUIRED", "Toma el pago para revisión antes de decidir.");
      }
      if (payment.status !== "VERIFYING") {
        return fail("INVALID_PAYMENT_STATE", "Este pago ya fue resuelto o no está en revisión.");
      }
      if (payment.verificationClaimedByAuthUserId !== staff.authUserId) {
        return fail("CLAIMED_BY_OTHER", "Otro operador está revisando este pago.");
      }

      const [latestSubmission] = await tx
        .select()
        .from(paymentSubmissions)
        .where(eq(paymentSubmissions.paymentId, paymentId))
        .orderBy(desc(paymentSubmissions.attemptNumber))
        .limit(1);
      if (!latestSubmission || latestSubmission.id !== submissionId) {
        return fail(
          "STALE_SUBMISSION",
          "El comprobante que revisaste ya no es el más reciente. Actualiza la página."
        );
      }

      const now = new Date();
      const actorId = staff.authUserId;
      let paymentStatus: "PAID" | "UNPAID" | "REJECTED" | "REFUNDED";
      let orderStatus: "CONFIRMED" | "PENDING" | "EXPIRED" | "CANCELLED" | "REFUNDED";
      let resubmissionGraceExpiresAt: Date | null = null;

      if (command.decision === "APPROVED") {
        if (order.status !== "PENDING" && order.status !== "EXPIRED") {
          return fail("INVALID_ORDER_STATE", "El pedido no admite aprobar este pago.");
        }

        if (command.refundExternalReference) {
          if (
            !latestSubmission.isLate ||
            payment.refundedAmountCents !== 0 ||
            payment.amountCents <= 0
          ) {
            return fail(
              "INVALID_PAYMENT_STATE",
              "Este pago no admite la devolución por falta de stock."
            );
          }
          if (!(await hasOnlyReleasedReservations(tx, order.id))) {
            return fail(
              "INVENTORY_STATE_CONFLICT",
              "Las reservas del pedido requieren revisión manual."
            );
          }

          await tx
            .update(payments)
            .set({
              status: "PAID",
              verificationClaimedByAuthUserId: null,
              verificationClaimedAt: null,
              resubmissionGraceExpiresAt: null,
              updatedAt: now,
            })
            .where(eq(payments.id, paymentId));

          const refundId = generateUuidV7();
          await tx.insert(refunds).values({
            id: refundId,
            orderId: order.id,
            paymentId,
            amountCents: payment.amountCents,
            reason: LATE_REFUND_REASON,
            externalReference: command.refundExternalReference,
            actorAuthUserId: actorId,
            createdAt: now,
          });
          await tx
            .update(payments)
            .set({
              status: "REFUNDED",
              refundedAmountCents: payment.amountCents,
              updatedAt: now,
            })
            .where(eq(payments.id, paymentId));
          await tx
            .update(orders)
            .set({
              status: "REFUNDED",
              cancelledAt: now,
              cancelReason: LATE_REFUND_REASON,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));

          paymentStatus = "REFUNDED";
          orderStatus = "REFUNDED";
          await tx.insert(outboxEvents).values({
            id: generateUuidV7(),
            eventName: "PaymentApproved",
            eventVersion: 1,
            aggregateType: "Payment",
            aggregateId: paymentId,
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              paymentId,
              submissionId,
              isLate: true,
              immediatelyRefunded: true,
              approvedAt: now.toISOString(),
            },
            status: "PENDING",
          });
          await tx.insert(outboxEvents).values({
            id: generateUuidV7(),
            eventName: "RefundIssued",
            eventVersion: 1,
            aggregateType: "Payment",
            aggregateId: paymentId,
            payload: {
              orderId: order.id,
              paymentId,
              refundId,
              refundAmountCents: payment.amountCents,
              totalRefundedCents: payment.amountCents,
              currency: payment.currency,
              reason: LATE_REFUND_REASON,
              issuedAt: now.toISOString(),
            },
            status: "PENDING",
          });
          await tx.insert(auditEvents).values({
            id: generateUuidV7(),
            timestamp: now,
            actorType: "ADMIN",
            actorId,
            action: "orders:late_refund",
            targetType: "Refund",
            targetId: refundId,
            metadata: {
              orderId: order.id,
              paymentId,
              submissionId,
              externalRefundCompleted: true,
            },
          });
        } else {
          await commitApprovalInventory(tx, {
            orderId: order.id,
            paymentId,
            actorId,
            isLate: latestSubmission.isLate,
          });

          await tx
            .update(payments)
            .set({
              status: "PAID",
              verificationClaimedByAuthUserId: null,
              verificationClaimedAt: null,
              resubmissionGraceExpiresAt: null,
              updatedAt: now,
            })
            .where(eq(payments.id, paymentId));

          await tx
            .update(orders)
            .set({ status: "CONFIRMED", updatedAt: now })
            .where(eq(orders.id, order.id));

          paymentStatus = "PAID";
          orderStatus = "CONFIRMED";

          await tx.insert(outboxEvents).values({
            id: generateUuidV7(),
            eventName: "PaymentApproved",
            eventVersion: 1,
            aggregateType: "Payment",
            aggregateId: paymentId,
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              paymentId,
              submissionId,
              isLate: latestSubmission.isLate,
              approvedAt: now.toISOString(),
            },
            status: "PENDING",
          });
        }
      } else if (command.decision === "REJECTED_RETRYABLE") {
        resubmissionGraceExpiresAt = new Date(now.getTime() + resubmissionGraceHours * 3_600_000);

        await tx
          .update(payments)
          .set({
            status: "UNPAID",
            verificationClaimedByAuthUserId: null,
            verificationClaimedAt: null,
            resubmissionGraceExpiresAt,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentId));

        paymentStatus = "UNPAID";
        orderStatus = order.status === "EXPIRED" ? "EXPIRED" : "PENDING";

        await tx.insert(outboxEvents).values({
          id: generateUuidV7(),
          eventName: "PaymentRejected",
          eventVersion: 1,
          aggregateType: "Payment",
          aggregateId: paymentId,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentId,
            submissionId,
            retryable: true,
            reason: command.reason,
            resubmissionGraceExpiresAt: resubmissionGraceExpiresAt.toISOString(),
            rejectedAt: now.toISOString(),
          },
          status: "PENDING",
        });
      } else {
        await tx
          .update(payments)
          .set({
            status: "REJECTED",
            verificationClaimedByAuthUserId: null,
            verificationClaimedAt: null,
            resubmissionGraceExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentId));

        // Emits PaymentRejected here; the consequence helper adds OrderCancelled and releases stock.
        await tx.insert(outboxEvents).values({
          id: generateUuidV7(),
          eventName: "PaymentRejected",
          eventVersion: 1,
          aggregateType: "Payment",
          aggregateId: paymentId,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentId,
            submissionId,
            retryable: false,
            reason: command.reason,
            rejectedAt: now.toISOString(),
          },
          status: "PENDING",
        });

        await applyTerminalPaymentRejectionConsequences(tx, {
          orderId: order.id,
          paymentId,
          rejectionReason: command.reason ?? "Pago rechazado",
          actorAuthUserId: actorId,
        });

        paymentStatus = "REJECTED";
        orderStatus = "CANCELLED";
      }

      const verificationId = generateUuidV7();
      await tx.insert(paymentVerifications).values({
        id: verificationId,
        paymentId,
        submissionId,
        verifierAuthUserId: actorId,
        decision: command.decision,
        rejectionReason: command.reason,
        verificationNotes: command.notes,
        verifiedAt: now,
      });

      // Notes are sensitive operational data; the audit trail records only that they exist.
      await tx.insert(auditEvents).values({
        id: generateUuidV7(),
        timestamp: now,
        actorType: "ADMIN",
        actorId,
        action: "orders:verify_payment",
        targetType: "Payment",
        targetId: paymentId,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          submissionId,
          verificationId,
          decision: command.decision,
          isLate: latestSubmission.isLate,
          hasNotes: command.notes !== null,
          immediatelyRefunded: !!command.refundExternalReference,
        },
      });

      const responsePayload: ReplayPayload = {
        verificationId,
        decision: command.decision,
        paymentStatus,
        orderStatus,
        resubmissionGraceExpiresAt: resubmissionGraceExpiresAt?.toISOString() ?? null,
      };

      await tx.insert(idempotencyKeys).values({
        id: generateUuidV7(),
        idempotencyKey: namespacedKey,
        operationType:
          command.decision === "APPROVED"
            ? command.refundExternalReference
              ? "REFUND_RECORDING"
              : "PAYMENT_VERIFICATION_APPROVE"
            : "PAYMENT_VERIFICATION_REJECT",
        authorityBindingDigest,
        sourceCartId: null,
        requestFingerprint,
        targetAggregateId: paymentId,
        responsePayload,
        expiresAt: new Date(Date.now() + idempotencyTtlMinutes * 60_000),
      });

      if (testVerificationTransactionHook) {
        await testVerificationTransactionHook("before_commit");
      }

      return { success: true as const, ...responsePayload, replayed: false };
    });
  } catch (error) {
    if (error instanceof VerificationAbort) {
      return error.result;
    }
    logger.error({
      event: "payment_verification_decision_failed",
      paymentId,
      decision: command.decision,
      err: error,
    });
    return fail("SYSTEM_ERROR", "No se pudo registrar la decisión sobre el pago.");
  }
}

async function hasOnlyReleasedReservations(tx: DbTransaction, orderId: string): Promise<boolean> {
  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId))
    .orderBy(asc(inventoryReservations.id))
    .for("update");
  return reservations.length > 0 && reservations.every((row) => row.status === "RELEASED");
}

async function commitApprovalInventory(
  tx: DbTransaction,
  params: { orderId: string; paymentId: string; actorId: string; isLate: boolean }
): Promise<void> {
  const inventoryInput = {
    orderId: params.orderId,
    actorId: params.actorId,
    referenceId: params.orderId,
    notes: params.isLate
      ? "Reasignación de stock por aprobación de pago tardío."
      : "Asignación confirmada tras aprobación de pago.",
  };

  const result = params.isLate
    ? await reacquireOrderInventoryAfterLatePayment(tx, inventoryInput)
    : await allocateOrderInventoryAfterPaymentApproval(tx, inventoryInput);

  if (result.success) return;

  if (result.code === "INSUFFICIENT_STOCK_FOR_REACQUISITION") {
    throw new VerificationAbort(
      fail("LATE_PAYMENT_STOCK_UNAVAILABLE", LATE_PAYMENT_STOCK_UNAVAILABLE_MESSAGE)
    );
  }

  logger.error({
    event: "payment_approval_inventory_rejected",
    orderId: params.orderId,
    paymentId: params.paymentId,
    code: result.code,
  });
  throw new VerificationAbort(
    fail(
      "INVENTORY_STATE_CONFLICT",
      "El inventario del pedido no está en un estado que permita aprobar. Revisa el pedido."
    )
  );
}
