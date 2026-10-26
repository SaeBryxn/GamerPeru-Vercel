"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customerProfiles, mediaUploads } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { getReviewEligibilityAction } from "./actions";
import {
  requestDirectUpload,
  verifyDirectUpload,
  registerDirectUploadAsset,
} from "@/lib/admin/media/direct-upload-service";
import {
  abortUpload,
  completeUpload,
  findUpload,
  setUploadAsset,
} from "@/lib/admin/media/upload-ledger";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { CatalogDomainError } from "@/lib/admin/catalog/types";

const requestSchema = z
  .object({
    productId: z.string().uuid(),
    mimeType: z.enum(["image/webp", "image/jpeg"]),
    fileSizeBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
  })
  .strict();
const confirmSchema = z
  .object({ productId: z.string().uuid(), uploadId: z.string().uuid() })
  .strict();

async function actor() {
  const identity = await getVerifiedIdentity();
  if (!identity.success) throw new Error("Inicia sesión para subir fotos.");
  return identity.identity.authUserId;
}

function failed(error: unknown) {
  return {
    success: false as const,
    error:
      error instanceof CatalogDomainError
        ? error.message
        : "No se pudo procesar la foto. Comprueba tu sesión e intenta de nuevo.",
  };
}

export async function requestReviewPhotoAction(input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return { success: false as const, error: "Usa fotos JPEG o WebP de hasta 2 MB." };
  try {
    const actorId = await actor();
    if ((await getReviewEligibilityAction(parsed.data.productId)).state !== "ELIGIBLE")
      return {
        success: false as const,
        error:
          "Solo puedes subir fotos de un producto que compraste y recibiste, antes de enviar tu opinión.",
      };
    const data = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`review-photos:${actorId}`}))`);
      const [count] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(mediaUploads)
        .where(
          and(
            eq(mediaUploads.actorAuthUserId, actorId),
            eq(mediaUploads.purpose, "review_photo"),
            gte(mediaUploads.createdAt, new Date(Date.now() - 24 * 3600_000))
          )
        );
      if (Number(count?.count ?? 0) >= 12)
        throw new CatalogDomainError(
          "Alcanzaste el límite diario de fotos. Inténtalo mañana.",
          "REVIEW_PHOTO_LIMIT",
          429
        );
      return requestDirectUpload(
        {
          purpose: "review_photo",
          actorId,
          subjectId: parsed.data.productId,
          keyPrefix: "reviews/photos",
          mimeType: parsed.data.mimeType,
          fileSizeBytes: parsed.data.fileSizeBytes,
        },
        { database: tx as unknown as typeof db }
      );
    });
    return { success: true as const, data };
  } catch (error) {
    return failed(error);
  }
}

export async function confirmReviewPhotoAction(input: unknown) {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Foto no válida." };
  try {
    const actorId = await actor();
    const token = await verifyDirectUpload({
      uploadId: parsed.data.uploadId,
      purpose: "review_photo",
      actorId,
    });
    if (token.subjectId !== parsed.data.productId)
      return { success: false as const, error: "La foto pertenece a otro producto." };
    // Recheck buyer eligibility and product binding; callers cannot attach staff or other buyers' assets.
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, actorId))
      .limit(1);
    if (!profile || (await getReviewEligibilityAction(parsed.data.productId)).state !== "ELIGIBLE")
      return { success: false as const, error: "Ya no puedes añadir fotos a esta opinión." };
    const asset = await db.transaction(async (tx) => {
      await completeUpload(tx, token.id, actorId);
      const { asset } = await registerDirectUploadAsset(tx, token);
      await setUploadAsset(tx, token.id, asset);
      return asset;
    });
    return {
      success: true as const,
      data: { id: asset.id, url: resolvePublicMediaUrl(asset.objectKey) },
    };
  } catch (error) {
    return failed(error);
  }
}

export async function abortReviewPhotoAction(uploadId: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(uploadId).success) return false;
  try {
    const actorId = await actor();
    const upload = await findUpload(uploadId);
    if (!upload || upload.purpose !== "review_photo" || upload.actorAuthUserId !== actorId)
      return false;
    await db.transaction((tx) => abortUpload(tx, uploadId, actorId));
    return true;
  } catch {
    return false;
  }
}
