"use client";

import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import { requestUpload, completeUpload } from "@/lib/media/upload-api-client";
import { uploadDirect } from "@/lib/media/direct-upload-client";
import { directUploadAccept } from "@/lib/media/direct-upload-policy";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

export type StoryImageUploadStage = "authorizing" | "uploading" | "processing";

export type StoryImageUploadResult =
  { ok: true; media: AdminStorySelectableMedia } | { ok: false; error: string };

export const STORY_IMAGE_ACCEPT = directUploadAccept("story_image");

/**
 * Uploads a story image through the shared direct upload: compressed in the browser, PUT
 * straight into the public R2 bucket, then registered and attached to the product's story.
 */
export async function uploadStoryImage(
  productId: string,
  file: File,
  onStage: (stage: StoryImageUploadStage) => void
): Promise<StoryImageUploadResult> {
  const result = await uploadDirect({
    purpose: "story_image",
    file,
    request: (input) => requestUpload({ purpose: "story_image", productId, ...input }),
    confirm: (input) => completeUpload({ purpose: "story_image", productId, ...input }),
    // Compression is part of authorizing from the operator's point of view.
    onStage: (stage) => onStage(stage === "preparing" ? "authorizing" : stage),
  });
  if (!result.ok) return result;

  if (!result.data.productMediaId)
    return { ok: false, error: "No se pudo vincular la imagen a la historia." };
  const publicUrl = resolvePublicMediaUrl(result.data.objectKey);
  if (!publicUrl) {
    return { ok: false, error: "La imagen se subió, pero no tiene una URL pública." };
  }

  return {
    ok: true,
    media: {
      productMediaId: result.data.productMediaId,
      mediaAssetId: result.data.mediaAssetId,
      variantId: null,
      variantTitle: null,
      displayOrder: 0,
      placement: "STORY",
      mediaType: "IMAGE",
      mimeType: result.data.mimeType,
      publicUrl,
      width: result.data.width,
      height: result.data.height,
      altText: null,
    },
  };
}
