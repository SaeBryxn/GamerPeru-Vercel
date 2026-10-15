"use client";

import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import {
  confirmStoryImageUploadAction,
  requestStoryImageUploadAction,
} from "@/lib/admin/catalog/story-media-actions";
import { compressImageForUpload } from "@/lib/media/compress-image";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

export type StoryImageUploadStage = "authorizing" | "uploading" | "processing";

export type StoryImageUploadResult =
  { ok: true; media: AdminStorySelectableMedia } | { ok: false; error: string };

// Mirrors STORY_IMAGE_MIME_TYPES and STORY_IMAGE_MAX_BYTES (the service module is server-only).
// The server checks both again, against the uploaded object itself.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10485760;
// Wide enough for a full-bleed banner on a large desktop at 2x.
const STORY_MAX_DIMENSION = 2560;

export const STORY_IMAGE_ACCEPT = ALLOWED_TYPES.join(",");

/** Reads the pixel size in the browser; display metadata only. */
async function measure(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Direct upload for a story image: the server only signs a URL (step 1), the browser PUTs the
 * file straight into the public R2 bucket (step 2), and the server registers it after a HEAD
 * check (step 3). The bytes never pass through the Worker, which keeps every request within the
 * Workers Free CPU budget regardless of the image size.
 */
export async function uploadStoryImage(
  productId: string,
  original: File,
  onStage: (stage: StoryImageUploadStage) => void
): Promise<StoryImageUploadResult> {
  if (!(ALLOWED_TYPES as readonly string[]).includes(original.type)) {
    return { ok: false, error: "Formato no admitido. Usa JPEG, PNG o WebP." };
  }

  onStage("authorizing");
  // The story image is served as uploaded, so this is also what the customer downloads.
  const file = await compressImageForUpload(original, { maxDimension: STORY_MAX_DIMENSION });
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: "La imagen pesa más de 10 MB. Reduce su tamaño e inténtalo de nuevo.",
    };
  }

  const [request, size] = await Promise.all([
    requestStoryImageUploadAction({ productId, mimeType: file.type, fileSizeBytes: file.size }),
    measure(file),
  ]);
  if (!request.success || !request.data) {
    return { ok: false, error: request.error ?? "No se pudo autorizar la subida." };
  }

  onStage("uploading");
  try {
    const put = await fetch(request.data.presignedPutUrl, {
      method: "PUT",
      headers: request.data.requiredHeaders,
      body: file,
    });
    if (!put.ok) {
      return { ok: false, error: "No se pudo transferir la imagen al almacenamiento." };
    }
  } catch {
    return { ok: false, error: "Se cortó la conexión mientras se subía la imagen." };
  }

  onStage("processing");
  const confirmed = await confirmStoryImageUploadAction({
    productId,
    uploadToken: request.data.uploadToken,
    width: size.width,
    height: size.height,
  });
  if (!confirmed.success || !confirmed.data) {
    return { ok: false, error: confirmed.error ?? "No se pudo registrar la imagen." };
  }

  const publicUrl = resolvePublicMediaUrl(confirmed.data.objectKey);
  if (!publicUrl) {
    return { ok: false, error: "La imagen se subió, pero no tiene una URL pública." };
  }

  return {
    ok: true,
    media: {
      productMediaId: confirmed.data.productMediaId,
      mediaAssetId: confirmed.data.mediaAssetId,
      variantId: null,
      variantTitle: null,
      displayOrder: 0,
      placement: "STORY",
      mediaType: "IMAGE",
      mimeType: confirmed.data.mimeType,
      publicUrl,
      width: confirmed.data.width,
      height: confirmed.data.height,
      altText: null,
    },
  };
}
