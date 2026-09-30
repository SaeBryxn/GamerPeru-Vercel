import { createHash } from "node:crypto";
import { CatalogDomainError } from "./types";
import { cloudflareImageProcessor } from "./cloudflare-image-processor";
import type { ImageProcessor } from "./image-processor";
import { type AllowedMediaUploadMimeType, MAX_MEDIA_FILE_SIZE_BYTES } from "./media-crypto";

export interface NormalizedImageResult {
  normalizedWebpBuffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  fileSizeBytes: number;
  checksumSha256: string;
  detectedIncomingMimeType: AllowedMediaUploadMimeType;
}

/**
 * Inspects binary magic bytes to determine the initial image container format.
 * Supports JPEG, PNG, WebP, and AVIF (ISOBMFF with ftyp).
 */
export function detectMagicMimeType(buffer: Buffer): AllowedMediaUploadMimeType | null {
  if (buffer.length < 12) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // 3. WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // 4. AVIF: ISOBMFF container (....ftypavif or ftypavis or compatible brands)
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const ftypLength = buffer.readUInt32BE(0);
    const boxLimit = Math.min(buffer.length, ftypLength > 0 ? ftypLength : buffer.length);
    const majorBrand = buffer.toString("ascii", 8, 12);
    if (majorBrand === "avif" || majorBrand === "avis") {
      return "image/avif";
    }

    // Inspect compatible brands starting at offset 16 (4 bytes each)
    let offset = 16;
    while (offset + 4 <= boxLimit) {
      const compatibleBrand = buffer.toString("ascii", offset, offset + 4);
      if (compatibleBrand === "avif" || compatibleBrand === "avis") {
        return "image/avif";
      }
      offset += 4;
    }
  }

  return null;
}

/**
 * Authoritative server-side validation and deterministic WebP normalization.
 *
 * Strict invariants:
 * - Buffer length > 0 and <= 10485760 (10 MiB)
 * - Magic bytes match supported set
 * - The image processor decodes the header (rejects corruption & disguised non-images)
 * - Decoded format must be compatible with expectedIncomingMimeType (rejects MIME spoofing)
 * - Auto-orients from EXIF, strips unnecessary metadata, preserves alpha
 * - Lossy WebP at quality 85
 * - Derives authoritative width and height from normalized WebP
 * - Derives SHA-256 content hash from final WebP bytes
 */
/**
 * Authoritative pure byte length boundary validation.
 * Verifies byte length > 0 and <= 10485760 (10 MiB).
 */
export function validateCatalogImageSize(byteLength: number): void {
  if (byteLength === 0) {
    throw new CatalogDomainError("El archivo de imagen está vacío.", "MEDIA_FILE_EMPTY", 400);
  }

  if (byteLength > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new CatalogDomainError(
      `El tamaño de la imagen (${byteLength} bytes) excede el límite máximo de 10 MiB (10485760 bytes).`,
      "MEDIA_FILE_TOO_LARGE",
      400
    );
  }
}

const WEBP_QUALITY = 85;

const ALLOWED_DECODED_MIME_TYPES: readonly AllowedMediaUploadMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

function isAllowedDecodedMime(mime: string): mime is AllowedMediaUploadMimeType {
  return (ALLOWED_DECODED_MIME_TYPES as readonly string[]).includes(mime);
}

export async function validateAndNormalizeCatalogImage(
  buffer: Buffer,
  expectedMime: AllowedMediaUploadMimeType,
  processor: ImageProcessor = cloudflareImageProcessor
): Promise<NormalizedImageResult> {
  // 1. Exact byte length boundary
  validateCatalogImageSize(buffer.length);

  // 2. Magic bytes inspection
  const magicMime = detectMagicMimeType(buffer);
  if (!magicMime) {
    throw new CatalogDomainError(
      "El formato de imagen no es reconocido o es inválido. Formatos permitidos: JPEG, PNG, WebP, AVIF.",
      "MEDIA_CORRUPT_OR_SPOOFED",
      400
    );
  }

  // 3. Decode & inspect
  let decodedMime: AllowedMediaUploadMimeType | null = null;
  try {
    const inspection = await processor.inspect(buffer);
    decodedMime = isAllowedDecodedMime(inspection.mimeType) ? inspection.mimeType : null;
  } catch {
    throw new CatalogDomainError(
      "La imagen contiene datos corruptos o no se pudo decodificar.",
      "MEDIA_CORRUPT_OR_SPOOFED",
      400
    );
  }

  if (!decodedMime) {
    throw new CatalogDomainError(
      "El formato decodificado de la imagen no está permitido.",
      "MEDIA_UNSUPPORTED_TYPE",
      400
    );
  }

  // 4. Reject MIME spoofing (decoded MIME and magic MIME must match expected MIME)
  if (decodedMime !== expectedMime || magicMime !== expectedMime) {
    throw new CatalogDomainError(
      `Discrepancia entre el tipo de contenido esperado (${expectedMime}) y el formato real de la imagen (${decodedMime}).`,
      "MEDIA_CORRUPT_OR_SPOOFED",
      400
    );
  }

  // 5. Deterministic WebP normalization; dimensions come from the encoded output, so they
  // reflect the EXIF orientation that was applied.
  let normalizedData: Buffer;
  let normalizedWidth: number;
  let normalizedHeight: number;
  try {
    normalizedData = Buffer.from(await processor.encodeWebp(buffer, { quality: WEBP_QUALITY }));
    const output = await processor.inspect(normalizedData);
    if (output.mimeType !== "image/webp") {
      throw new Error(`Unexpected normalized format: ${output.mimeType}`);
    }
    normalizedWidth = output.width;
    normalizedHeight = output.height;
  } catch {
    throw new CatalogDomainError(
      "Error al normalizar la imagen al formato estándar WebP.",
      "MEDIA_CORRUPT_OR_SPOOFED",
      500
    );
  }

  if (normalizedWidth <= 0 || normalizedHeight <= 0 || normalizedData.length === 0) {
    throw new CatalogDomainError(
      "Dimensiones o contenido inválido tras la normalización de la imagen.",
      "MEDIA_CORRUPT_OR_SPOOFED",
      500
    );
  }

  // 6. SHA-256 content hash of final normalized WebP bytes
  const checksumSha256 = createHash("sha256").update(normalizedData).digest("hex");

  return {
    normalizedWebpBuffer: normalizedData,
    mimeType: "image/webp",
    width: normalizedWidth,
    height: normalizedHeight,
    fileSizeBytes: normalizedData.length,
    checksumSha256,
    detectedIncomingMimeType: decodedMime,
  };
}
