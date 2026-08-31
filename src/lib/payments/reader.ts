import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, paymentInstructionVersions, paymentMethodConfigurations } from "@/db/schema";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";
import { generateQrPresignedGetUrl } from "@/lib/storage/qr-read";
import { resolveAuthorizedPayment } from "./authority";

export type PaymentInstructionDTO = {
  orderNumber: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  recipientName: string;
  accountIdentifier: string;
  instructionText: string;
  qrSignedUrl: string | null;
  amountCents: number;
  currency: string;
  paymentStatus: string;
  resubmissionGraceExpiresAt: Date | null;
  isEligibleForSubmission: boolean;
};

export type LoadPaymentInstructionsResult =
  | { success: true; instructions: PaymentInstructionDTO }
  | { success: false; code: "NOT_AVAILABLE"; error: string };

/**
 * Loads authoritative payment instructions frozen at checkout for an authorized Order.
 */
export async function loadAuthorizedPaymentInstructions(
  orderNumber: string
): Promise<LoadPaymentInstructionsResult> {
  const authResult = await resolveAuthorizedPayment(orderNumber);
  if (!authResult.authorized) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  const { order, payment } = authResult;

  // 1. Load exact frozen instruction version
  const [instructionVersion] = await db
    .select()
    .from(paymentInstructionVersions)
    .where(eq(paymentInstructionVersions.id, payment.instructionVersionId))
    .limit(1);

  if (!instructionVersion) {
    return {
      success: false,
      code: "NOT_AVAILABLE",
      error: "Instrucciones de pago no disponibles.",
    };
  }

  // 2. Load payment method name
  let paymentMethodName = instructionVersion.paymentMethodCode;
  const [methodConfig] = await db
    .select({ name: paymentMethodConfigurations.name })
    .from(paymentMethodConfigurations)
    .where(eq(paymentMethodConfigurations.code, instructionVersion.paymentMethodCode))
    .limit(1);

  if (methodConfig) {
    paymentMethodName = methodConfig.name;
  }

  // 3. Resolve QR Signed URL if present and verified PRIVATE_PAYMENT_INSTRUCTION
  let qrSignedUrl: string | null = null;
  if (instructionVersion.qrMediaId) {
    const [media] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, instructionVersion.qrMediaId))
      .limit(1);

    if (media && media.securityClass === "PRIVATE_PAYMENT_INSTRUCTION") {
      const storageCap = validatePrivateStorageCapability("QR_READ");
      if (storageCap.isAvailable) {
        try {
          qrSignedUrl = await generateQrPresignedGetUrl({
            s3Client: storageCap.client,
            bucketName: storageCap.bucketName,
            objectKey: media.objectKey,
          });
        } catch {
          // Graceful fallback to text-only instructions if signed GET fails
          qrSignedUrl = null;
        }
      }
    }
  }

  const now = new Date();
  const isInitialUnpaid = payment.status === "UNPAID" && !payment.resubmissionGraceExpiresAt;
  const isResubmissionAllowed =
    payment.status === "UNPAID" &&
    payment.resubmissionGraceExpiresAt !== null &&
    payment.resubmissionGraceExpiresAt > now;

  return {
    success: true,
    instructions: {
      orderNumber: order.orderNumber,
      paymentMethodCode: instructionVersion.paymentMethodCode,
      paymentMethodName,
      recipientName: instructionVersion.recipientName,
      accountIdentifier: instructionVersion.accountIdentifier,
      instructionText: instructionVersion.instructionText,
      qrSignedUrl,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paymentStatus: payment.status,
      resubmissionGraceExpiresAt: payment.resubmissionGraceExpiresAt,
      isEligibleForSubmission: isInitialUnpaid || isResubmissionAllowed,
    },
  };
}
