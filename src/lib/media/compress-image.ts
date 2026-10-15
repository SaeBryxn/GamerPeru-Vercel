export interface CompressImageOptions {
  /** Longest side of the output, in pixels. Larger images are scaled down. */
  maxDimension: number;
  /** Encoder quality between 0 and 1. */
  quality?: number;
  /**
   * Always upload the re-encoded result, never the original: drawing through a canvas drops
   * EXIF/GPS metadata and bakes in the orientation. Without a WebP encoder the image is painted
   * over white and saved as JPEG, so transparency does not turn black. Throws when the browser
   * cannot decode or encode the image.
   */
  alwaysReencode?: boolean;
}

export class ImagePreparationError extends Error {
  constructor() {
    super("No se pudo preparar la imagen en este navegador. Prueba con otro archivo JPEG o PNG.");
    this.name = "ImagePreparationError";
  }
}

const DEFAULT_QUALITY = 0.86;

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renameWithExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "imagen"}.${extension}`;
}

/**
 * Downscales and re-encodes an image in the browser before it is uploaded, so the server never
 * has to fetch, hash and transform a multi-megabyte original (the catalog pipeline runs inside a
 * CPU-limited Worker). Output is WebP; a browser without a WebP encoder falls back to JPEG for
 * JPEG sources only, since JPEG would drop the transparency of a PNG or WebP.
 *
 * Returns the original file untouched when it cannot be decoded here or when re-encoding would
 * not make it smaller, so the caller can always upload the result.
 */
export async function compressImageForUpload(
  file: File,
  { maxDimension, quality = DEFAULT_QUALITY, alwaysReencode = false }: CompressImageOptions
): Promise<File> {
  const keepOriginal = (): File => {
    if (alwaysReencode) throw new ImagePreparationError();
    return file;
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return keepOriginal();
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return keepOriginal();
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    let blob = await encode(canvas, "image/webp", quality);
    let extension = "webp";
    // toBlob silently answers with PNG when the requested encoder is missing.
    if (!blob || blob.type !== "image/webp") {
      if (!alwaysReencode && file.type !== "image/jpeg") return file;
      if (alwaysReencode) {
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      blob = await encode(canvas, "image/jpeg", quality);
      extension = "jpg";
      if (!blob || blob.type !== "image/jpeg") return keepOriginal();
    }

    if (!alwaysReencode && scale === 1 && blob.size >= file.size) return file;

    return new File([blob], renameWithExtension(file.name, extension), {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
