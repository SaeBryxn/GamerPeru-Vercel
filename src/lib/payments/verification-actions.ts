"use server";

import { refresh } from "next/cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { validateUuid } from "@/lib/inventory/validation";
import { getPaymentProofViewUrl, type PaymentProofViewResult } from "./proof-viewer";
import { getPaymentVerificationDetail, type VerificationDetail } from "./verification-queue";
import {
  approvePayment,
  claimPaymentVerification,
  rejectPayment,
  releasePaymentVerificationClaim,
  type ApprovePaymentInput,
  type ClaimPaymentVerificationResult,
  type PaymentVerificationDecisionResult,
  type RejectPaymentInput,
  type ReleasePaymentVerificationClaimResult,
} from "./verification-service";

// Failures that mean the row changed under the operator: the queue is refreshed so it shows why.
const STALE_STATE_CODES = new Set([
  "CLAIMED_BY_OTHER",
  "CLAIM_REQUIRED",
  "INVALID_PAYMENT_STATE",
  "STALE_SUBMISSION",
]);

function refreshAfter<T extends { success: boolean; code?: string }>(result: T): T {
  if (result.success || (result.code && STALE_STATE_CODES.has(result.code))) {
    refresh();
  }
  return result;
}

export type VerificationDetailActionResult =
  { success: true; detail: VerificationDetail } | { success: false; error: string };

export async function loadVerificationDetailAction(
  paymentId: string
): Promise<VerificationDetailActionResult> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("orders:verify")) {
    return { success: false, error: "No tienes permisos para verificar pagos." };
  }
  const idCheck = validateUuid(paymentId, "paymentId");
  if (!idCheck.valid || !idCheck.normalized) {
    return { success: false, error: "Pago inválido." };
  }

  const detail = await getPaymentVerificationDetail(idCheck.normalized);
  return detail ? { success: true, detail } : { success: false, error: "Pago no disponible." };
}

export async function getProofViewUrlAction(submissionId: string): Promise<PaymentProofViewResult> {
  return getPaymentProofViewUrl(submissionId);
}

export async function claimPaymentAction(
  paymentId: string
): Promise<ClaimPaymentVerificationResult> {
  return refreshAfter(await claimPaymentVerification({ paymentId }));
}

export async function releasePaymentAction(
  paymentId: string
): Promise<ReleasePaymentVerificationClaimResult> {
  return refreshAfter(await releasePaymentVerificationClaim({ paymentId }));
}

export async function approvePaymentAction(
  input: ApprovePaymentInput
): Promise<PaymentVerificationDecisionResult> {
  return refreshAfter(await approvePayment(input));
}

export async function rejectPaymentAction(
  input: RejectPaymentInput
): Promise<PaymentVerificationDecisionResult> {
  return refreshAfter(await rejectPayment(input));
}
