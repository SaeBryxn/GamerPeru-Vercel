import "server-only";
import { createHash } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_BUCKETS } from "./r2";

export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type ValidatedImageResult =
  | {
      valid: true;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      extension: "jpg" | "png" | "webp";
    }
  | { valid: false; reason: string };

/**
 * Inspects binary buffer magic bytes and structure to derive authoritative image MIME and extension.
 * Rejects polyglots, SVGs, HTML, scripts, and truncated headers.
 */
export function validateImageStructure(buffer: Buffer): ValidatedImageResult {
  if (buffer.length < 16) {
    return { valid: false, reason: "El archivo es demasiado pequeño o está truncado." };
  }

  // Check JPEG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg", extension: "jpg" };
  }

  // Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: "image/png", extension: "png" };
  }

  // Check WebP (RIFF .... WEBP)
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { valid: true, mimeType: "image/webp", extension: "webp" };
  }

  return {
    valid: false,
    reason:
      "Formato de imagen no permitido. Solo se aceptan comprobantes JPG, PNG o WebP legítimos.",
  };
}

/**
 * Computes full-payload SHA-256 checksum in hexadecimal.
 */
export function computeBufferSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generates a short-lived pre-signed PUT URL for uploading a staging proof object.
 */
export async function generateProofUploadPresignedPutUrl(params: {
  s3Client: S3Client;
  bucketName?: string;
  stagingKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const bucket = params.bucketName ?? R2_BUCKETS.PRIVATE_PROOFS;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.stagingKey,
    ContentType: params.contentType,
  });

  return getSignedUrl(params.s3Client, command, {
    expiresIn: params.expiresInSeconds ?? 60, // 60-second technical TTL
  });
}

/**
 * Validates the uploaded staging object in R2 and copies it to the immutable final object key.
 */
export async function validateAndFinalizeStagingProof(params: {
  s3Client: S3Client;
  bucketName?: string;
  paymentId: string;
  uploadIntentId: string;
  stagingKey: string;
}): Promise<
  | {
      success: true;
      finalKey: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      fileSizeBytes: number;
      checksumSha256: string;
    }
  | { success: false; error: string }
> {
  const bucket = params.bucketName ?? R2_BUCKETS.PRIVATE_PROOFS;

  // 1. HeadObject to verify existence and size
  let contentLength = 0;
  try {
    const headRes = await params.s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: params.stagingKey,
      })
    );
    contentLength = headRes.ContentLength ?? 0;
  } catch {
    return {
      success: false,
      error: "No se encontró el comprobante en almacenamiento temporal.",
    };
  }

  if (contentLength <= 0 || contentLength > MAX_PROOF_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `El tamaño del comprobante (${contentLength} bytes) excede el límite máximo de 5MB.`,
    };
  }

  // 2. GetObject to read full buffer and inspect magic bytes
  let buffer: Buffer;
  try {
    const getRes = await params.s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: params.stagingKey,
      })
    );

    if (!getRes.Body) {
      return { success: false, error: "Contenido del comprobante vacío." };
    }

    const byteArray = await getRes.Body.transformToByteArray();
    buffer = Buffer.from(byteArray);
  } catch {
    return {
      success: false,
      error: "Error al leer el comprobante para validación de seguridad.",
    };
  }

  if (buffer.length !== contentLength) {
    return {
      success: false,
      error: "Discrepancia en la longitud del archivo descargado.",
    };
  }

  // 3. Validate image magic bytes
  const validation = validateImageStructure(buffer);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  // 4. Compute full SHA-256
  const checksumSha256 = computeBufferSha256(buffer);

  // 5. Build final deterministic key
  const finalKey = `payment-proofs/final/${params.paymentId}/${params.uploadIntentId}.${validation.extension}`;

  // 6. CopyObject from staging to final
  try {
    await params.s3Client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${params.stagingKey}`,
        Key: finalKey,
        ContentType: validation.mimeType,
      })
    );
  } catch {
    return {
      success: false,
      error: "Error al registrar el comprobante definitivo.",
    };
  }

  return {
    success: true,
    finalKey,
    mimeType: validation.mimeType,
    fileSizeBytes: buffer.length,
    checksumSha256,
  };
}

/**
 * Best-effort deletion of an R2 object (staging or uncommitted candidate).
 */
export async function bestEffortDeleteR2Object(params: {
  s3Client: S3Client;
  bucketName?: string;
  key: string;
}): Promise<void> {
  try {
    const bucket = params.bucketName ?? R2_BUCKETS.PRIVATE_PROOFS;
    await params.s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: params.key,
      })
    );
  } catch {
    // Non-blocking best-effort cleanup
  }
}
