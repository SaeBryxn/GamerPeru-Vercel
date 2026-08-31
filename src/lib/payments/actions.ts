"use server";

import { headers } from "next/headers";
import { loadAuthorizedPaymentInstructions, type LoadPaymentInstructionsResult } from "./reader";
import {
  createPaymentProofUploadIntent,
  submitPaymentProof,
  type CreateUploadIntentResult,
  type SubmitPaymentProofResult,
} from "./service";

/**
 * Server action to load authoritative frozen payment instructions for an authorized order.
 */
export async function loadPaymentInstructionsAction(
  orderNumber: string
): Promise<LoadPaymentInstructionsResult> {
  return loadAuthorizedPaymentInstructions(orderNumber);
}

/**
 * Server action to request an upload intent and pre-signed PUT URL for payment proof upload.
 */
export async function requestProofUploadIntentAction(input: {
  orderNumber: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
}): Promise<CreateUploadIntentResult> {
  return createPaymentProofUploadIntent(input);
}

/**
 * Server action to submit manual payment proof (operation code + optional voucher).
 */
export async function submitPaymentProofAction(input: {
  orderNumber: string;
  submissionAttemptId: string;
  operationCode: string;
  uploadIntentId?: string | null;
  customerNotes?: string | null;
}): Promise<SubmitPaymentProofResult> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const clientIp = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : null;

  return submitPaymentProof({
    ...input,
    clientIp,
  });
}
