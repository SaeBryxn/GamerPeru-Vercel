import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, type MediaAsset } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { R2_BUCKETS } from "@/lib/storage/r2-buckets";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import {
  getDefaultCatalogStorageAdapter,
  type CatalogStorageAdapter,
} from "@/lib/admin/catalog/media-storage";
import { reserveUpload, findUpload, abortUpload } from "./upload-ledger";
import {
  DIRECT_UPLOAD_POLICIES,
  checkDirectUpload,
  type DirectUploadPurpose,
} from "@/lib/media/direct-upload-policy";
import { sniffImage } from "@/lib/media/image-sniff";

const UPLOAD_WINDOW_SECONDS = 15 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const KEY_PREFIX_REGEX =
  /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$/;

export interface DirectUploadOptions {
  storageAdapter?: CatalogStorageAdapter;
  database?: typeof db;
  nowSeconds?: number;
}
export interface DirectUploadRequest {
  uploadId: string;
  putUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}
export interface RequestDirectUploadInput {
  purpose: DirectUploadPurpose;
  actorId: string;
  subjectId: string | null;
  variantId?: string | null;
  keyPrefix: string;
  mimeType: string;
  fileSizeBytes: number;
}
export interface VerifiedDirectUpload {
  id: string;
  purpose: DirectUploadPurpose;
  actorId: string;
  subjectId: string | null;
  variantId: string | null;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
}

export async function requestDirectUpload(
  input: RequestDirectUploadInput,
  options?: DirectUploadOptions
): Promise<DirectUploadRequest> {
  const problem = checkDirectUpload(input.purpose, {
    type: input.mimeType,
    size: input.fileSizeBytes,
  });
  if (problem) throw new CatalogDomainError(problem.message, problem.code, 400);
  if (!KEY_PREFIX_REGEX.test(input.keyPrefix))
    throw new CatalogDomainError(
      "La ruta de almacenamiento no es válida.",
      "DIRECT_UPLOAD_INVALID_PREFIX",
      400
    );
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const objectKey = `${input.keyPrefix}/${generateUuidV7()}.${DIRECT_UPLOAD_POLICIES[input.purpose].mimeTypes[input.mimeType]}`;
  const expiresAt = nowSeconds + UPLOAD_WINDOW_SECONDS;
  const adapter = options?.storageAdapter ?? getDefaultCatalogStorageAdapter();
  return (options?.database ?? db).transaction(async (tx) => {
    const upload = await reserveUpload(tx, {
      ...input,
      sizeBytes: input.fileSizeBytes,
      objectKey,
      expiresAt: new Date(expiresAt * 1000),
    });
    const putUrl = await adapter.generatePresignedPutUrl({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: objectKey,
      contentType: input.mimeType,
      cacheControl: CACHE_CONTROL,
      contentLength: input.fileSizeBytes,
      expiresInSeconds: UPLOAD_WINDOW_SECONDS,
    });
    return {
      uploadId: upload.id,
      putUrl,
      requiredHeaders: { "Content-Type": input.mimeType, "Cache-Control": CACHE_CONTROL },
      expiresAt,
    };
  });
}

const FORMAT_MIME = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  webm: "video/webm",
} as const;
export async function verifyDirectUpload(
  input: { uploadId: string; purpose: DirectUploadPurpose; actorId: string },
  options?: DirectUploadOptions
): Promise<VerifiedDirectUpload> {
  const database = options?.database ?? db;
  const row = await findUpload(input.uploadId, database);
  if (!row)
    throw new CatalogDomainError("No encontramos la subida.", "DIRECT_UPLOAD_NOT_FOUND", 404);
  if (row.actorAuthUserId !== input.actorId)
    throw new CatalogDomainError(
      "Esta subida fue autorizada para otra sesión.",
      "DIRECT_UPLOAD_ACTOR_MISMATCH",
      403
    );
  if (row.purpose !== input.purpose)
    throw new CatalogDomainError(
      "La subida no corresponde a este tipo de archivo.",
      "DIRECT_UPLOAD_PURPOSE_MISMATCH",
      400
    );
  if (row.status !== "PENDING" && row.status !== "READY")
    throw new CatalogDomainError(
      "La subida ya no puede confirmarse.",
      "DIRECT_UPLOAD_TERMINAL",
      409
    );
  const verified: VerifiedDirectUpload = {
    id: row.id,
    purpose: input.purpose,
    actorId: row.actorAuthUserId,
    subjectId: row.subjectId,
    variantId: row.variantId,
    objectKey: row.objectKey,
    mimeType: row.mimeType,
    fileSizeBytes: row.declaredSizeBytes,
    width: row.width,
    height: row.height,
  };
  if (row.status === "READY") return verified;
  if (row.expiresAt.getTime() < (options?.nowSeconds ?? Math.floor(Date.now() / 1000)) * 1000)
    throw new CatalogDomainError(
      "La autorización de subida expiró. Vuelve a subir el archivo.",
      "DIRECT_UPLOAD_EXPIRED",
      409
    );
  const adapter = options?.storageAdapter ?? getDefaultCatalogStorageAdapter();
  const object = { bucket: R2_BUCKETS.PUBLIC_MEDIA, key: row.objectKey };
  const head = await adapter.headObject(object);
  if (!head)
    throw new CatalogDomainError(
      "No encontramos el archivo subido.",
      "DIRECT_UPLOAD_NOT_FOUND",
      404
    );
  const reject = async (code: string): Promise<never> => {
    await database.transaction((tx) => abortUpload(tx, row.id, input.actorId, code, adapter));
    throw new CatalogDomainError(
      "El archivo no coincide con el tipo, tamaño o firma autorizados. Vuelve a subirlo.",
      code,
      422
    );
  };
  if (head.contentLength !== row.declaredSizeBytes || head.contentType !== row.mimeType)
    return reject("DIRECT_UPLOAD_MISMATCH");
  const bytes = await adapter.getObjectRange?.({ ...object, start: 0, end: 4095 });
  const sniffed = bytes ? sniffImage(bytes) : null;
  if (!sniffed || FORMAT_MIME[sniffed.format] !== row.mimeType)
    return reject("DIRECT_UPLOAD_SIGNATURE_MISMATCH");
  const dimensionLimit = DIRECT_UPLOAD_POLICIES[input.purpose].maxImageDimension;
  if (
    dimensionLimit &&
    (Number(sniffed.width) > dimensionLimit || Number(sniffed.height) > dimensionLimit)
  )
    return reject("DIRECT_UPLOAD_SIGNATURE_MISMATCH");
  return { ...verified, width: sniffed.width, height: sniffed.height };
}

function boundedDimension(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20000
    ? value
    : null;
}

type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Inserts the `media_assets` row for a verified upload, or returns the existing one so a
 * repeated confirm is idempotent. Dimensions come from the verified object header.
 */
export async function registerDirectUploadAsset(
  executor: Executor,
  token: VerifiedDirectUpload,
  _dimensions?: { width?: number | null; height?: number | null }
): Promise<{ asset: MediaAsset; created: boolean }> {
  const [existing] = await executor
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.objectKey, token.objectKey));
  if (existing) return { asset: existing, created: false };

  const [asset] = await executor
    .insert(mediaAssets)
    .values({
      objectKey: token.objectKey,
      securityClass: "PUBLIC_MEDIA",
      mediaType: DIRECT_UPLOAD_POLICIES[token.purpose].mediaType,
      mimeType: token.mimeType,
      fileSizeBytes: token.fileSizeBytes,
      width: boundedDimension(token.width),
      height: boundedDimension(token.height),
    })
    .returning();
  return { asset: asset!, created: true };
}
