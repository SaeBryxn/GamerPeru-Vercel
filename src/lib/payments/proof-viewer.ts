import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, mediaAssets, paymentSubmissions } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { validateUuid } from "@/lib/inventory/validation";
import { logger } from "@/lib/logger";
import { validatePrivateStorageCapability } from "@/lib/storage/private-config";
import { generateProofPresignedGetUrl, PROOF_VIEW_URL_TTL_SECONDS } from "@/lib/storage/proof-read";

export type PaymentProofViewResult =
  | { success: true; url: string; mimeType: string; expiresAt: string }
  | {
      success: false;
      code: "UNAUTHORIZED" | "INVALID_INPUT" | "NO_PROOF" | "STORAGE_UNAVAILABLE" | "SYSTEM_ERROR";
      error: string;
    };

/**
 * Signs a 5-minute URL for the voucher of one submission.
 *
 * Only staff holding orders:verify may call it, and every issued URL is audited: a voucher shows
 * a customer's bank or wallet details, so who looked at it matters.
 */
export async function getPaymentProofViewUrl(
  submissionId: string
): Promise<PaymentProofViewResult> {
  const authContext = await getVerifiedAuthContext();
  if (
    authContext.status !== "READY" ||
    !authContext.authUserId ||
    !authContext.permissions.has("orders:verify")
  ) {
    return {
      success: false,
      code: "UNAUTHORIZED",
      error: "No tienes permisos para ver comprobantes.",
    };
  }

  const idCheck = validateUuid(submissionId, "submissionId");
  if (!idCheck.valid || !idCheck.normalized) {
    return { success: false, code: "INVALID_INPUT", error: "Comprobante inválido." };
  }

  try {
    const [proof] = await db
      .select({
        paymentId: paymentSubmissions.paymentId,
        objectKey: mediaAssets.objectKey,
        mimeType: mediaAssets.mimeType,
        securityClass: mediaAssets.securityClass,
      })
      .from(paymentSubmissions)
      .innerJoin(mediaAssets, eq(mediaAssets.id, paymentSubmissions.proofMediaId))
      .where(eq(paymentSubmissions.id, idCheck.normalized))
      .limit(1);

    if (!proof || proof.securityClass !== "PRIVATE_PAYMENT_PROOF") {
      return { success: false, code: "NO_PROOF", error: "Este envío no incluye comprobante." };
    }

    const storage = validatePrivateStorageCapability("PROOF_UPLOAD");
    if (!storage.isAvailable) {
      logger.error({ event: "payment_proof_storage_unavailable", reason: storage.reason });
      return {
        success: false,
        code: "STORAGE_UNAVAILABLE",
        error: "El almacenamiento de comprobantes no está disponible.",
      };
    }

    const url = await generateProofPresignedGetUrl({
      s3Client: storage.client,
      bucketName: storage.bucketName,
      objectKey: proof.objectKey,
      mimeType: proof.mimeType,
    });

    await db.insert(auditEvents).values({
      id: generateUuidV7(),
      actorType: "ADMIN",
      actorId: authContext.authUserId,
      action: "orders:view_payment_proof",
      targetType: "PaymentSubmission",
      targetId: idCheck.normalized,
      metadata: { paymentId: proof.paymentId },
    });

    return {
      success: true,
      url,
      mimeType: proof.mimeType,
      expiresAt: new Date(Date.now() + PROOF_VIEW_URL_TTL_SECONDS * 1000).toISOString(),
    };
  } catch (error) {
    logger.error({
      event: "payment_proof_view_failed",
      submissionId: idCheck.normalized,
      err: error,
    });
    return { success: false, code: "SYSTEM_ERROR", error: "No se pudo abrir el comprobante." };
  }
}
