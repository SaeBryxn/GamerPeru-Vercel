import { readFileSync } from "node:fs";
import { generateUuidV7 } from "@/db/utils/uuid";
import type { MediaUpload } from "@/db/schema";
import type { CatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import type { reserveUpload as reserve } from "@/lib/admin/media/upload-ledger";

const rows = new Map<string, MediaUpload>();
export async function reserveUpload(
  _tx: unknown,
  input: Parameters<typeof reserve>[1]
): Promise<MediaUpload> {
  const row: MediaUpload = {
    id: generateUuidV7(),
    actorAuthUserId: input.actorId,
    purpose: input.purpose,
    subjectId: input.subjectId,
    variantId: input.variantId ?? null,
    objectKey: input.objectKey,
    mimeType: input.mimeType,
    declaredSizeBytes: input.sizeBytes,
    expiresAt: input.expiresAt,
    status: "PENDING",
    mediaAssetId: null,
    width: null,
    height: null,
    failureCode: null,
    createdAt: new Date(),
    completedAt: null,
  };
  rows.set(row.id, row);
  return row;
}
export async function findUpload(id: string) {
  return rows.get(id);
}
export async function completeUpload(_tx: unknown, id: string) {
  const upload = rows.get(id);
  if (!upload) throw new Error("Reserva fixture ausente.");
  const alreadyReady = upload.status === "READY";
  upload.status = "READY";
  return { upload, alreadyReady };
}
export async function setUploadAsset(
  _tx: unknown,
  id: string,
  asset: { id: string; width: number | null; height: number | null }
) {
  const row = rows.get(id);
  if (row) {
    row.mediaAssetId = asset.id;
    row.width = asset.width;
    row.height = asset.height;
  }
}
export async function abortUpload(
  _tx: unknown,
  id: string,
  _actor: string,
  code: string,
  adapter: CatalogStorageAdapter
) {
  const row = rows.get(id);
  if (row) {
    await adapter.deleteObject({ bucket: "public-media", key: row.objectKey });
    row.status = code === "EXPIRED" ? "EXPIRED" : "REJECTED";
  }
}
export function fixtureHeader(mimeType: string): Uint8Array {
  const names: Record<string, string> = {
    "image/webp": "opaque.webp",
    "image/jpeg": "progressive.jpg",
    "image/png": "image.png",
  };
  const filename = names[mimeType];
  if (filename) return readFileSync(`tests/fixtures/media/${filename}`);
  if (mimeType === "video/webm") return new Uint8Array([26, 69, 223, 163]);
  return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
}
