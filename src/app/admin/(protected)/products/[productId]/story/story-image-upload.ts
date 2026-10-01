"use client";

import {
  finalizeMediaUploadAction,
  requestMediaUploadIntentAction,
} from "@/lib/admin/catalog/actions";
import type { AllowedMediaUploadMimeType } from "@/lib/admin/catalog/media-crypto";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

export type StoryImageUploadStage = "authorizing" | "uploading" | "processing";

export type StoryImageUploadResult =
  { ok: true; media: AdminStorySelectableMedia } | { ok: false; error: string };

// Mirrors ALLOWED_MEDIA_UPLOAD_MIME_TYPES and MAX_MEDIA_FILE_SIZE_BYTES: media-crypto pulls in
// node:crypto, so only its types are imported here. The server enforces both again.
const ALLOWED_TYPES: readonly AllowedMediaUploadMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
const MAX_BYTES = 10485760;

export const STORY_IMAGE_ACCEPT = ALLOWED_TYPES.join(",");

/**
 * Uploads an image for the product story only: the same signed intent, direct R2 transfer and
 * server-side WebP normalization as gallery photos, but the intent carries placement STORY, so
 * the image is attached to the product without ever joining its gallery, cards or thumbnails.
 */
export async function uploadStoryImage(
  productId: string,
  file: File,
  onStage: (stage: StoryImageUploadStage) => void
): Promise<StoryImageUploadResult> {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Formato no admitido. Usa JPEG, PNG, WebP o AVIF." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: "La imagen pesa más de 10 MB. Reduce su tamaño e inténtalo de nuevo.",
    };
  }

  onStage("authorizing");
  const intent = await requestMediaUploadIntentAction({
    productId,
    mimeType: file.type as AllowedMediaUploadMimeType,
    placement: "STORY",
  });
  if (!intent.success || !intent.data) {
    return { ok: false, error: intent.error ?? "No se pudo autorizar la subida." };
  }

  onStage("uploading");
  try {
    const put = await fetch(intent.data.presignedPutUrl, {
      method: "PUT",
      headers: intent.data.requiredHeaders,
      body: file,
    });
    if (!put.ok) {
      return { ok: false, error: "No se pudo transferir la imagen al almacenamiento." };
    }
  } catch {
    return { ok: false, error: "Se cortó la conexión mientras se subía la imagen." };
  }

  onStage("processing");
  const finalized = await finalizeMediaUploadAction({
    productId,
    signedIntentToken: intent.data.signedIntentToken,
    mutationRequestId: crypto.randomUUID(),
  });
  if (!finalized.success || !finalized.data) {
    return { ok: false, error: finalized.error ?? "No se pudo registrar la imagen." };
  }

  const publicUrl = resolvePublicMediaUrl(finalized.data.objectKey);
  if (!publicUrl) {
    return { ok: false, error: "La imagen se subió, pero no tiene una URL pública." };
  }

  return {
    ok: true,
    media: {
      productMediaId: finalized.data.productMediaId,
      mediaAssetId: finalized.data.mediaAssetId,
      variantId: null,
      variantTitle: null,
      displayOrder: 0,
      placement: "STORY",
      mediaType: "IMAGE",
      mimeType: "image/webp",
      publicUrl,
      width: finalized.data.width,
      height: finalized.data.height,
      altText: null,
    },
  };
}
