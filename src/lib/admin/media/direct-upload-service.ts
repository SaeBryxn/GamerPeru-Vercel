import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { mediaAssets, type MediaAsset } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getCatalogMediaIntentSecret } from "@/config/server-env";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import {
  R2CatalogStorageAdapter,
  type CatalogStorageAdapter,
} from "@/lib/admin/catalog/media-storage";
import {
  DIRECT_UPLOAD_POLICIES,
  DIRECT_UPLOAD_PURPOSES,
  checkDirectUpload,
  type DirectUploadPurpose,
} from "@/lib/media/direct-upload-policy";

/**
 * Direct-to-R2 uploads (ADR-012). The browser PUTs the file to its final key in the public
 * bucket through a presigned URL; the server only signs the request and later confirms the
 * stored object with a HEAD. No upload body is read, hashed or transformed in the Worker, which
 * keeps every request inside the Workers Free CPU budget whatever the file size.
 *
 * The signature binds type, Cache-Control and exact length, so R2 itself refuses a different
 * body. The HEAD check is the second line: an object that does not match what was signed is
 * deleted and rejected.
 */

const UPLOAD_WINDOW_SECONDS = 15 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const KEY_PREFIX_REGEX =
  /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$/;

const tokenSchema = z
  .object({
    v: z.literal(2),
    purpose: z.enum(DIRECT_UPLOAD_PURPOSES),
    actorId: z.string().min(1),
    /** Entity the upload belongs to (a product for story images), when there is one. */
    subjectId: z.string().uuid().nullable(),
    /** Variant the upload belongs to (gallery photos), when there is one. */
    variantId: z.string().uuid().nullable().default(null),
    objectKey: z.string().min(1).max(500),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type DirectUploadToken = z.infer<typeof tokenSchema>;

export interface DirectUploadOptions {
  storageAdapter?: CatalogStorageAdapter;
  intentSecret?: string;
  nowSeconds?: number;
}

export interface DirectUploadRequest {
  uploadToken: string;
  presignedPutUrl: string;
  /** Headers the browser must send with the PUT; they are part of the signature. */
  requiredHeaders: Record<string, string>;
}

export interface RequestDirectUploadInput {
  purpose: DirectUploadPurpose;
  actorId: string;
  subjectId: string | null;
  variantId?: string | null;
  /** Folder of the final key, e.g. `home/videos`; the file name is generated here. */
  keyPrefix: string;
  mimeType: string;
  fileSizeBytes: number;
}

function signToken(token: DirectUploadToken, secret: string): string {
  const body = Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${signature}`;
}

function verifyToken(raw: string, secret: string, nowSeconds: number): DirectUploadToken {
  const invalid = () =>
    new CatalogDomainError(
      "La autorización de subida no es válida. Vuelve a subir el archivo.",
      "DIRECT_UPLOAD_TOKEN_INVALID",
      400
    );
  const parts = raw.split(".");
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) throw invalid();

  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"), "hex");
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw invalid();

  let parsed: DirectUploadToken;
  try {
    parsed = tokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    throw invalid();
  }
  if (parsed.expiresAt < nowSeconds) {
    throw new CatalogDomainError(
      "La autorización de subida expiró. Vuelve a subir el archivo.",
      "DIRECT_UPLOAD_TOKEN_EXPIRED",
      400
    );
  }
  return parsed;
}

/** Signs one direct upload at a fresh key under `keyPrefix`. Callers authorize the actor first. */
export async function requestDirectUpload(
  input: RequestDirectUploadInput,
  options?: DirectUploadOptions
): Promise<DirectUploadRequest> {
  const problem = checkDirectUpload(input.purpose, {
    type: input.mimeType,
    size: input.fileSizeBytes,
  });
  if (problem) throw new CatalogDomainError(problem.message, problem.code, 400);
  if (!KEY_PREFIX_REGEX.test(input.keyPrefix)) {
    throw new CatalogDomainError(
      "La ruta de almacenamiento no es válida.",
      "DIRECT_UPLOAD_INVALID_PREFIX",
      400
    );
  }

  const policy = DIRECT_UPLOAD_POLICIES[input.purpose];
  const extension = policy.mimeTypes[input.mimeType];
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const objectKey = `${input.keyPrefix}/${generateUuidV7()}.${extension}`;
  const uploadToken = signToken(
    {
      v: 2,
      purpose: input.purpose,
      actorId: input.actorId,
      subjectId: input.subjectId,
      variantId: input.variantId ?? null,
      objectKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      expiresAt: nowSeconds + UPLOAD_WINDOW_SECONDS,
    },
    getCatalogMediaIntentSecret(options?.intentSecret)
  );

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const presignedPutUrl = await adapter.generatePresignedPutUrl({
    bucket: R2_BUCKETS.PUBLIC_MEDIA,
    key: objectKey,
    contentType: input.mimeType,
    cacheControl: CACHE_CONTROL,
    contentLength: input.fileSizeBytes,
    expiresInSeconds: UPLOAD_WINDOW_SECONDS,
  });

  return {
    uploadToken,
    presignedPutUrl,
    requiredHeaders: { "Content-Type": input.mimeType, "Cache-Control": CACHE_CONTROL },
  };
}

/**
 * Verifies the token (signature, expiry, purpose, actor) and the stored object (HEAD only).
 * Returns the verified token; the caller registers the asset and any link in one transaction.
 */
export async function verifyDirectUpload(
  input: { uploadToken: string; purpose: DirectUploadPurpose; actorId: string },
  options?: DirectUploadOptions
): Promise<DirectUploadToken> {
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const token = verifyToken(
    input.uploadToken,
    getCatalogMediaIntentSecret(options?.intentSecret),
    nowSeconds
  );
  if (token.purpose !== input.purpose) {
    throw new CatalogDomainError(
      "La autorización de subida no corresponde a este tipo de archivo.",
      "DIRECT_UPLOAD_PURPOSE_MISMATCH",
      400
    );
  }
  if (token.actorId !== input.actorId) {
    throw new CatalogDomainError(
      "Esta subida fue autorizada para otra sesión.",
      "DIRECT_UPLOAD_ACTOR_MISMATCH",
      403
    );
  }

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const head = await adapter.headObject({ bucket: R2_BUCKETS.PUBLIC_MEDIA, key: token.objectKey });
  if (!head) {
    throw new CatalogDomainError(
      "No encontramos el archivo subido. Vuelve a intentarlo.",
      "DIRECT_UPLOAD_NOT_FOUND",
      404
    );
  }
  if (head.contentLength !== token.fileSizeBytes || head.contentType !== token.mimeType) {
    await adapter.deleteObject({ bucket: R2_BUCKETS.PUBLIC_MEDIA, key: token.objectKey });
    throw new CatalogDomainError(
      "El archivo subido no coincide con lo autorizado (tipo o tamaño). Vuelve a subirlo.",
      "DIRECT_UPLOAD_MISMATCH",
      422
    );
  }
  return token;
}

function boundedDimension(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20000
    ? value
    : null;
}

type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Inserts the `media_assets` row for a verified upload, or returns the existing one so a
 * repeated confirm is idempotent. Dimensions come from the browser and are display metadata
 * only, so they are bounds-checked rather than trusted.
 */
export async function registerDirectUploadAsset(
  executor: Executor,
  token: DirectUploadToken,
  dimensions: { width?: number | null; height?: number | null }
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
      width: boundedDimension(dimensions.width),
      height: boundedDimension(dimensions.height),
    })
    .returning();
  return { asset: asset!, created: true };
}
