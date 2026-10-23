"use server";

import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { validateUuid } from "@/lib/inventory/validation";
import { getPaymentProofViewUrl, type PaymentProofViewResult } from "./proof-viewer";
import { getPaymentVerificationDetail, type VerificationDetail } from "./verification-queue";
import {
  approvePayment,
  claimPaymentVerification,
  rejectPayment,
  recordLatePaymentRefund,
  releasePaymentVerificationClaim,
  type ApprovePaymentInput,
  type ClaimPaymentVerificationResult,
  type PaymentVerificationDecisionResult,
  type RejectPaymentInput,
  type RecordLatePaymentRefundInput,
  type ReleasePaymentVerificationClaimResult,
} from "./verification-service";

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
  return await claimPaymentVerification({ paymentId });
}

export async function releasePaymentAction(
  paymentId: string
): Promise<ReleasePaymentVerificationClaimResult> {
  return await releasePaymentVerificationClaim({ paymentId });
}

export async function approvePaymentAction(
  input: ApprovePaymentInput
): Promise<PaymentVerificationDecisionResult> {
  return await approvePayment(input);
}

export async function rejectPaymentAction(
  input: RejectPaymentInput
): Promise<PaymentVerificationDecisionResult> {
  return await rejectPayment(input);
}

export async function recordLatePaymentRefundAction(
  input: RecordLatePaymentRefundInput
): Promise<PaymentVerificationDecisionResult> {
  return await recordLatePaymentRefund(input);
}
