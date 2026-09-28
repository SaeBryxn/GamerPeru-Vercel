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
import { generateUuidV7 } from "@/db/utils/uuid";
import { logger } from "@/lib/logger";
import { describeStorageError } from "./storage-error";

export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type ValidatedImageResult =
  | {
      valid: true;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      extension: "jpg" | "png" | "webp";
    }
  | { valid: false; reason: string };

// Standard CRC-32 Table (IEEE 802.3 / ISO 3309)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c;
}

/**
 * Computes IEEE 802.3 CRC-32 over a slice of Buffer.
 */
export function computeCrc32(buffer: Buffer, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateJpegStructure(buffer: Buffer): { valid: true } | { valid: false; reason: string } {
  if (buffer.length < 50) {
    return { valid: false, reason: "Archivo JPEG truncado o incompleto." };
  }

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { valid: false, reason: "Encabezado JPEG inválido." };
  }

  let offset = 2;
  let hasSof = false;
  let hasSos = false;

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset++;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset++];
    if (marker === undefined) {
      return { valid: false, reason: "Marcador JPEG truncado." };
    }

    if (marker === 0xd9) {
      if (!hasSof || !hasSos) {
        return { valid: false, reason: "JPEG incompleto: faltan marcos o datos de escaneo." };
      }
      // EOI must be the exact physical end of the buffer
      if (offset !== buffer.length) {
        return {
          valid: false,
          reason: "Bytes no permitidos después del fin del archivo JPEG (EOI).",
        };
      }
      return { valid: true };
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > buffer.length) {
      return { valid: false, reason: "Marcador JPEG truncado." };
    }

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) {
      return { valid: false, reason: "Longitud de segmento JPEG inválida o desbordada." };
    }

    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc9 && marker <= 0xcb)) {
      if (length < 8) {
        return { valid: false, reason: "Encabezado de cuadro SOF JPEG inválido." };
      }
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      const numComponents = buffer[offset + 7];
      if (height === 0 || width === 0 || numComponents === undefined || numComponents < 1) {
        return { valid: false, reason: "Dimensiones de imagen JPEG inválidas." };
      }
      hasSof = true;
    }

    if (marker === 0xda) {
      hasSos = true;
      offset += length;

      while (offset < buffer.length) {
        if (buffer[offset] === 0xff) {
          if (offset + 1 >= buffer.length) {
            return {
              valid: false,
              reason: "Datos de escaneo JPEG truncados al final del archivo.",
            };
          }
          const nextByte = buffer[offset + 1];
          if (nextByte === undefined) {
            return {
              valid: false,
              reason: "Datos de escaneo JPEG truncados al final del archivo.",
            };
          }
          if (nextByte === 0x00) {
            offset += 2;
          } else if (nextByte >= 0xd0 && nextByte <= 0xd7) {
            offset += 2;
          } else if (nextByte === 0xff) {
            offset++;
          } else {
            break;
          }
        } else {
          offset++;
        }
      }
      continue;
    }

    offset += length;
  }

  return {
    valid: false,
    reason: "JPEG truncado: no se encontró el marcador de finalización EOI (FF D9).",
  };
}

function validatePngStructure(buffer: Buffer): { valid: true } | { valid: false; reason: string } {
  if (buffer.length < 57) {
    return { valid: false, reason: "Archivo PNG truncado o incompleto." };
  }

  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== pngSig[i]) {
      return { valid: false, reason: "Firma PNG inválida." };
    }
  }

  let offset = 8;
  let hasIhdr = false;
  let hasIdat = false;
  let hasIend = false;

  while (offset + 8 <= buffer.length) {
    const chunkLen = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const totalChunkBytes = 12 + chunkLen;

    if (offset + totalChunkBytes > buffer.length) {
      return { valid: false, reason: `Chunk PNG '${chunkType}' truncado o longitud inválida.` };
    }

    // Validate chunk CRC-32 over Type + Data
    const chunkCrc = buffer.readUInt32BE(offset + 8 + chunkLen);
    const expectedCrc = computeCrc32(buffer, offset + 4, offset + 8 + chunkLen);
    if (chunkCrc !== expectedCrc) {
      return { valid: false, reason: `CRC de chunk PNG inválido (${chunkType}).` };
    }

    if (!hasIhdr) {
      if (chunkType !== "IHDR" || chunkLen !== 13) {
        return { valid: false, reason: "El primer chunk de un PNG debe ser IHDR con longitud 13." };
      }
      const width = buffer.readUInt32BE(offset + 8);
      const height = buffer.readUInt32BE(offset + 12);
      const bitDepth = buffer[offset + 16];
      const colorType = buffer[offset + 17];
      const compression = buffer[offset + 18];
      const filter = buffer[offset + 19];
      const interlace = buffer[offset + 20];

      if (width === 0 || height === 0) {
        return { valid: false, reason: "Dimensiones de imagen PNG inválidas." };
      }
      if (compression !== 0) {
        return { valid: false, reason: "Método de compresión IHDR PNG inválido." };
      }
      if (filter !== 0) {
        return { valid: false, reason: "Método de filtro IHDR PNG inválido." };
      }
      if (interlace !== 0 && interlace !== 1) {
        return { valid: false, reason: "Método de entrelazado IHDR PNG inválido." };
      }

      // Check valid bitDepth for colorType per PNG specification
      let validBitDepth = false;
      if (colorType === 0 && bitDepth !== undefined && [1, 2, 4, 8, 16].includes(bitDepth)) {
        validBitDepth = true;
      } else if (colorType === 2 && bitDepth !== undefined && [8, 16].includes(bitDepth)) {
        validBitDepth = true;
      } else if (colorType === 3 && bitDepth !== undefined && [1, 2, 4, 8].includes(bitDepth)) {
        validBitDepth = true;
      } else if (colorType === 4 && bitDepth !== undefined && [8, 16].includes(bitDepth)) {
        validBitDepth = true;
      } else if (colorType === 6 && bitDepth !== undefined && [8, 16].includes(bitDepth)) {
        validBitDepth = true;
      }

      if (!validBitDepth) {
        return { valid: false, reason: "Tipo de color o profundidad de bits IHDR PNG inválida." };
      }

      hasIhdr = true;
    } else if (chunkType === "IDAT") {
      hasIdat = true;
    } else if (chunkType === "IEND") {
      if (chunkLen !== 0) {
        return { valid: false, reason: "Chunk IEND de PNG debe tener longitud 0." };
      }
      if (!hasIdat) {
        return { valid: false, reason: "PNG no contiene datos de imagen (IDAT)." };
      }
      hasIend = true;
      offset += totalChunkBytes;
      // IEND must be the exact physical end of the file
      if (offset !== buffer.length) {
        return {
          valid: false,
          reason: "Bytes no permitidos después del chunk IEND de PNG.",
        };
      }
      break;
    }

    offset += totalChunkBytes;
  }

  if (!hasIhdr || !hasIdat || !hasIend) {
    return { valid: false, reason: "Estructura PNG incompleta: falta IHDR, IDAT o IEND." };
  }

  return { valid: true };
}

function validateWebpStructure(buffer: Buffer): { valid: true } | { valid: false; reason: string } {
  if (buffer.length < 26) {
    return { valid: false, reason: "Archivo WebP truncado o incompleto." };
  }

  if (buffer[0] !== 0x52 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x46) {
    return { valid: false, reason: "Encabezado RIFF inválido." };
  }

  const riffSize = buffer.readUInt32LE(4);
  const expectedTotalBytes = riffSize + 8;

  // Strict exact length match: no trailing bytes and no truncation
  if (riffSize < 12 || buffer.length !== expectedTotalBytes) {
    return {
      valid: false,
      reason: "Longitud del archivo WebP no coincide exactamente con el contenedor RIFF.",
    };
  }

  const webpFourCc = buffer.toString("ascii", 8, 12);
  if (webpFourCc !== "WEBP") {
    return { valid: false, reason: "Encabezado WebP inválido." };
  }

  let offset = 12;
  let hasImagePayload = false;

  while (offset + 8 <= expectedTotalBytes) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkDataSize = buffer.readUInt32LE(offset + 4);
    const paddedChunkSize = chunkDataSize + (chunkDataSize % 2);

    if (offset + 8 + chunkDataSize > expectedTotalBytes) {
      return { valid: false, reason: `Chunk WebP '${chunkType}' excede el contenedor RIFF.` };
    }

    if (chunkType === "ANIM" || chunkType === "ANMF") {
      return { valid: false, reason: "WebP animado no soportado." };
    }

    if (chunkType === "VP8 ") {
      if (chunkDataSize < 10) {
        return { valid: false, reason: "Chunk VP8 lossy WebP truncado." };
      }
      const b11 = buffer[offset + 11];
      const b12 = buffer[offset + 12];
      const b13 = buffer[offset + 13];
      if (b11 === undefined || b12 === undefined || b13 === undefined) {
        return { valid: false, reason: "Chunk VP8 lossy WebP truncado." };
      }
      const keyframeCode = (b11 << 16) | (b12 << 8) | b13;
      if (keyframeCode !== 0x9d012a) {
        return { valid: false, reason: "Código de inicio de cuadro VP8 inválido." };
      }
      const width = buffer.readUInt16LE(offset + 14) & 0x3fff;
      const height = buffer.readUInt16LE(offset + 16) & 0x3fff;
      if (width === 0 || height === 0) {
        return { valid: false, reason: "Dimensiones de imagen WebP VP8 inválidas." };
      }
      hasImagePayload = true;
    } else if (chunkType === "VP8L") {
      if (chunkDataSize < 5) {
        return { valid: false, reason: "Chunk VP8L lossless WebP truncado." };
      }
      const b8 = buffer[offset + 8];
      if (b8 !== 0x2f) {
        return { valid: false, reason: "Firma de chunk VP8L WebP inválida." };
      }
      hasImagePayload = true;
    } else if (chunkType === "VP8X") {
      if (chunkDataSize < 10) {
        return { valid: false, reason: "Chunk VP8X extended WebP truncado." };
      }
      const canvasWidth = 1 + buffer.readUIntLE(offset + 12, 3);
      const canvasHeight = 1 + buffer.readUIntLE(offset + 15, 3);
      if (canvasWidth <= 0 || canvasHeight <= 0) {
        return { valid: false, reason: "Dimensiones de lienzo WebP VP8X inválidas." };
      }
      // VP8X is an extended container header, NOT the image payload itself
    }

    offset += 8 + paddedChunkSize;
  }

  if (!hasImagePayload) {
    return {
      valid: false,
      reason: "El archivo WebP no contiene fragmentos de imagen válidos (VP8 o VP8L).",
    };
  }

  if (offset !== expectedTotalBytes) {
    return { valid: false, reason: "Estructura de chunks WebP corrupta o desalineada." };
  }

  return { valid: true };
}

/**
 * Inspects binary buffer structure to derive authoritative image MIME and extension.
 * Rejects truncated buffers, malformed chunks, and non-image payloads.
 */
export function validateImageStructure(buffer: Buffer): ValidatedImageResult {
  if (buffer.length < 26 || buffer.length > MAX_PROOF_FILE_SIZE_BYTES) {
    return {
      valid: false,
      reason: "El archivo es demasiado pequeño, está truncado o excede los 5MB permitidos.",
    };
  }

  // Detect JPEG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const jpegRes = validateJpegStructure(buffer);
    if (!jpegRes.valid) {
      return { valid: false, reason: jpegRes.reason };
    }
    return { valid: true, mimeType: "image/jpeg", extension: "jpg" };
  }

  // Detect PNG (89 50 4E 47 0D 0A 1A 0A)
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
    const pngRes = validatePngStructure(buffer);
    if (!pngRes.valid) {
      return { valid: false, reason: pngRes.reason };
    }
    return { valid: true, mimeType: "image/png", extension: "png" };
  }

  // Detect WebP (RIFF .... WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const webpRes = validateWebpStructure(buffer);
    if (!webpRes.valid) {
      return { valid: false, reason: webpRes.reason };
    }
    return { valid: true, mimeType: "image/webp", extension: "webp" };
  }

  return {
    valid: false,
    reason:
      "Formato de imagen no permitido o corrupto. Solo se aceptan comprobantes JPG, PNG o WebP legítimos.",
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
  candidateId?: string;
}): Promise<
  | {
      success: true;
      finalKey: string;
      candidateId: string;
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
  } catch (error) {
    logger.error({
      event: "payment_proof_staging_head_failed",
      bucket,
      ...describeStorageError(error),
    });
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
  } catch (error) {
    logger.error({
      event: "payment_proof_staging_read_failed",
      bucket,
      ...describeStorageError(error),
    });
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

  // 5. Build unique request-owned candidate key with server-generated candidateId
  const candidateId = params.candidateId ?? generateUuidV7();
  const finalKey = `payment-proofs/final/${params.paymentId}/${params.uploadIntentId}/${candidateId}.${validation.extension}`;

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
  } catch (error) {
    logger.error({
      event: "payment_proof_finalize_copy_failed",
      bucket,
      ...describeStorageError(error),
    });
    return {
      success: false,
      error: "Error al registrar el comprobante definitivo.",
    };
  }

  return {
    success: true,
    finalKey,
    candidateId,
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
  } catch (error) {
    // Cleanup is best-effort; the failure is logged so orphaned objects can be traced.
    logger.warn({ event: "payment_proof_cleanup_failed", ...describeStorageError(error) });
  }
}
