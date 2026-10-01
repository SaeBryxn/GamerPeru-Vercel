import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { canonicalSerialize } from "./crypto";

export const ALLOWED_MEDIA_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedMediaUploadMimeType = (typeof ALLOWED_MEDIA_UPLOAD_MIME_TYPES)[number];

export const MAX_MEDIA_FILE_SIZE_BYTES = 10485760; // 10 MiB exactly

export const catalogMediaUploadIntentPayloadSchema = z
  .object({
    version: z.literal(1),
    intentId: z.string().min(1),
    verifiedActorId: z.string().min(1),
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable(),
    stagingObjectKey: z.string().min(1),
    expectedIncomingMimeType: z.enum(ALLOWED_MEDIA_UPLOAD_MIME_TYPES),
    maximumBytes: z.literal(MAX_MEDIA_FILE_SIZE_BYTES),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine((data) => data.stagingObjectKey === `temp/catalog/${data.intentId}`, {
    message: "stagingObjectKey must exactly match temp/catalog/{intentId}",
    path: ["stagingObjectKey"],
  })
  .refine((data) => data.expiresAt > data.issuedAt, {
    message: "expiresAt must be after issuedAt",
    path: ["expiresAt"],
  });

export type CatalogMediaUploadIntentPayload = z.infer<typeof catalogMediaUploadIntentPayloadSchema>;

/**
 * Signs a validated intent payload with HMAC-SHA256 using the canonical secret.
 * Returns a bearer token string: base64url(canonicalJson) + "." + signatureHex.
 */
export function signMediaUploadIntent(
  payload: CatalogMediaUploadIntentPayload,
  secret: string
): string {
  const validated = catalogMediaUploadIntentPayloadSchema.parse(payload);
  const canonicalJson = canonicalSerialize(validated);
  const hmac = createHmac("sha256", secret).update(canonicalJson).digest("hex");
  const encodedPayload = Buffer.from(canonicalJson, "utf8").toString("base64url");
  return `${encodedPayload}.${hmac}`;
}

export interface VerifyMediaUploadIntentOptions {
  currentServerTimeSeconds?: number;
  clockSkewSeconds?: number;
}

/**
 * Verifies the HMAC-SHA256 signature in constant time and checks strict schema,
 * actor, clock skew, and expiry rules.
 */
export function verifyAndParseMediaUploadIntent(
  token: string,
  secret: string,
  options?: VerifyMediaUploadIntentOptions
): CatalogMediaUploadIntentPayload {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new Error("INVALID_MEDIA_INTENT_TOKEN_FORMAT");
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("INVALID_MEDIA_INTENT_TOKEN_FORMAT");
  }

  const [encodedPayload, providedSignatureHex] = parts;
  let rawPayloadJson: string;
  try {
    rawPayloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    throw new Error("INVALID_MEDIA_INTENT_TOKEN_PAYLOAD");
  }

  // Compute expected HMAC over the exact payload string
  const expectedSignatureHex = createHmac("sha256", secret).update(rawPayloadJson).digest("hex");

  // Constant-time signature comparison
  const providedBuffer = Buffer.from(providedSignatureHex, "hex");
  const expectedBuffer = Buffer.from(expectedSignatureHex, "hex");

  if (
    providedBuffer.length !== 32 ||
    expectedBuffer.length !== 32 ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("INVALID_MEDIA_INTENT_SIGNATURE");
  }

  // Parse and strictly validate payload schema
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayloadJson);
  } catch {
    throw new Error("INVALID_MEDIA_INTENT_TOKEN_JSON");
  }

  const validation = catalogMediaUploadIntentPayloadSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error("INVALID_MEDIA_INTENT_SCHEMA");
  }

  const payload = validation.data;
  const now = options?.currentServerTimeSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options?.clockSkewSeconds ?? 60;

  // Issued at must not be in the future (beyond clock skew)
  if (payload.issuedAt > now + skew) {
    throw new Error("MEDIA_INTENT_TOKEN_FUTURE_ISSUED");
  }

  // Must not be expired
  if (payload.expiresAt <= now) {
    throw new Error("MEDIA_INTENT_TOKEN_EXPIRED");
  }

  return payload;
}

/**
 * Computes the canonical mediaIntentDigest from the immutable capability fields.
 * Does NOT include HMAC signature, presigned URLs, credentials, or volatile headers.
 */
export function computeMediaIntentDigest(payload: CatalogMediaUploadIntentPayload): string {
  const capabilityFields = {
    expectedIncomingMimeType: payload.expectedIncomingMimeType,
    expiresAt: payload.expiresAt,
    intentId: payload.intentId,
    issuedAt: payload.issuedAt,
    maximumBytes: payload.maximumBytes,
    productId: payload.productId,
    stagingObjectKey: payload.stagingObjectKey,
    variantId: payload.variantId,
    version: payload.version,
    verifiedActorId: payload.verifiedActorId,
  };

  const serialized = canonicalSerialize(capabilityFields);
  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Derives a deterministic 64-bit signed BigInt for PostgreSQL advisory lock on media intent single consumption.
 * Format: gp024:media-intent:{digest}
 */
export function createCatalogMediaIntentAdvisoryLockKey(mediaIntentDigest: string): bigint {
  const hash = createHash("sha256")
    .update(`gp024:media-intent:${mediaIntentDigest.trim().toLowerCase()}`)
    .digest();
  return hash.readBigInt64BE(0);
}
