import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaStorageBudget, mediaUploads, type MediaUpload } from "@/db/schema";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import {
  getDefaultCatalogStorageAdapter,
  type CatalogStorageAdapter,
} from "@/lib/admin/catalog/media-storage";
import { R2_BUCKETS } from "@/lib/storage/r2-buckets";
import type { DirectUploadPurpose } from "@/lib/media/direct-upload-policy";

export type UploadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function reserveUpload(
  tx: UploadTransaction,
  input: {
    actorId: string;
    purpose: DirectUploadPurpose;
    subjectId: string | null;
    variantId?: string | null;
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt: Date;
  }
): Promise<MediaUpload> {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new CatalogDomainError(
      "El tamaño de subida no es válido.",
      "DIRECT_UPLOAD_INVALID_SIZE",
      400
    );
  }
  const reserved = await tx
    .update(mediaStorageBudget)
    .set({
      reservedBytes: sql`${mediaStorageBudget.reservedBytes} + ${input.sizeBytes}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaStorageBudget.id, 1),
        sql`${mediaStorageBudget.usedBytes} + ${mediaStorageBudget.reservedBytes} + ${input.sizeBytes} <= ${mediaStorageBudget.budgetBytes}`
      )
    )
    .returning({ id: mediaStorageBudget.id });
  if (!reserved.length)
    throw new CatalogDomainError(
      "Se alcanzó el presupuesto de almacenamiento de medios.",
      "MEDIA_BUDGET_EXCEEDED",
      409
    );
  const [upload] = await tx
    .insert(mediaUploads)
    .values({
      actorAuthUserId: input.actorId,
      purpose: input.purpose,
      subjectId: input.subjectId,
      variantId: input.variantId ?? null,
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      declaredSizeBytes: input.sizeBytes,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!upload) throw new Error("No se pudo registrar la reserva de medios.");
  return upload;
}

export async function findUpload(
  uploadId: string,
  database = db
): Promise<MediaUpload | undefined> {
  const [row] = await database.select().from(mediaUploads).where(eq(mediaUploads.id, uploadId));
  return row;
}

async function lockedUpload(tx: UploadTransaction, uploadId: string, actorId: string) {
  const [upload] = await tx
    .select()
    .from(mediaUploads)
    .where(eq(mediaUploads.id, uploadId))
    .for("update");
  if (!upload)
    throw new CatalogDomainError("No encontramos la subida.", "DIRECT_UPLOAD_NOT_FOUND", 404);
  if (upload.actorAuthUserId !== actorId)
    throw new CatalogDomainError(
      "Esta subida pertenece a otra sesión.",
      "DIRECT_UPLOAD_ACTOR_MISMATCH",
      403
    );
  return upload;
}

export async function completeUpload(
  tx: UploadTransaction,
  uploadId: string,
  actorId: string
): Promise<{ upload: MediaUpload; alreadyReady: boolean }> {
  const upload = await lockedUpload(tx, uploadId, actorId);
  if (upload.status === "READY") return { upload, alreadyReady: true };
  if (upload.status !== "PENDING")
    throw new CatalogDomainError(
      "La subida ya no puede confirmarse.",
      "DIRECT_UPLOAD_TERMINAL",
      409
    );
  await tx
    .update(mediaStorageBudget)
    .set({
      reservedBytes: sql`${mediaStorageBudget.reservedBytes} - ${upload.declaredSizeBytes}`,
      usedBytes: sql`${mediaStorageBudget.usedBytes} + ${upload.declaredSizeBytes}`,
      updatedAt: new Date(),
    })
    .where(eq(mediaStorageBudget.id, 1));
  await tx
    .update(mediaUploads)
    .set({ status: "READY", completedAt: new Date() })
    .where(eq(mediaUploads.id, uploadId));
  return { upload, alreadyReady: false };
}

export async function setUploadAsset(
  tx: UploadTransaction,
  uploadId: string,
  asset: { id: string; width: number | null; height: number | null }
): Promise<void> {
  await tx
    .update(mediaUploads)
    .set({ mediaAssetId: asset.id, width: asset.width, height: asset.height })
    .where(eq(mediaUploads.id, uploadId));
}

export async function abortUpload(
  tx: UploadTransaction,
  uploadId: string,
  actorId: string,
  code = "USER_ABORTED",
  adapter?: CatalogStorageAdapter
): Promise<void> {
  const upload = await lockedUpload(tx, uploadId, actorId);
  if (upload.status !== "PENDING") return;
  // Keep the row lock while deleting: a concurrent complete must never publish a deleted object.
  await (adapter ?? getDefaultCatalogStorageAdapter()).deleteObject({
    bucket: R2_BUCKETS.PUBLIC_MEDIA,
    key: upload.objectKey,
  });
  await tx
    .update(mediaStorageBudget)
    .set({
      reservedBytes: sql`${mediaStorageBudget.reservedBytes} - ${upload.declaredSizeBytes}`,
      updatedAt: new Date(),
    })
    .where(eq(mediaStorageBudget.id, 1));
  await tx
    .update(mediaUploads)
    .set({
      status:
        code === "EXPIRED"
          ? "EXPIRED"
          : code === "DIRECT_UPLOAD_SIGNATURE_MISMATCH" || code === "DIRECT_UPLOAD_MISMATCH"
            ? "REJECTED"
            : "ABORTED",
      failureCode: code,
      completedAt: new Date(),
    })
    .where(eq(mediaUploads.id, uploadId));
}

export async function expireStaleUploads(
  now: Date,
  limit = 100,
  options?: { database?: typeof db; storageAdapter?: CatalogStorageAdapter }
): Promise<{ expired: number }> {
  const database = options?.database ?? db;
  return database.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(mediaUploads)
      .where(
        and(
          eq(mediaUploads.status, "PENDING"),
          lt(mediaUploads.expiresAt, new Date(now.getTime() - 3600_000))
        )
      )
      .orderBy(mediaUploads.expiresAt)
      .limit(Math.max(0, Math.min(100, limit)))
      .for("update", { skipLocked: true });
    for (const upload of pending)
      await abortUpload(tx, upload.id, upload.actorAuthUserId, "EXPIRED", options?.storageAdapter);
    return { expired: pending.length };
  });
}
