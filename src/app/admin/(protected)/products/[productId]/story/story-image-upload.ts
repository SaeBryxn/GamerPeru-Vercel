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
export const STORY_VIDEO_ACCEPT = directUploadAccept("story_video");

/**
 * Uploads a story image or MP4 video through the shared direct upload: images are compressed in
 * the browser, both are PUT straight into the public R2 bucket, then registered and attached to
 * the product's story.
 */
export async function uploadStoryMedia(
  productId: string,
  file: File,
  mediaType: "IMAGE" | "VIDEO",
  onStage: (stage: StoryImageUploadStage) => void
): Promise<StoryImageUploadResult> {
  const purpose = mediaType === "VIDEO" ? "story_video" : "story_image";
  const result = await uploadDirect({
    purpose,
    file,
    request: (input) => requestUpload({ purpose, productId, ...input }),
    confirm: (input) => completeUpload({ purpose, productId, ...input }),
    // Compression is part of authorizing from the operator's point of view.
    onStage: (stage) => onStage(stage === "preparing" ? "authorizing" : stage),
  });
  if (!result.ok) return result;

  const noun = mediaType === "VIDEO" ? "el video" : "la imagen";
  if (!result.data.productMediaId)
    return { ok: false, error: `No se pudo vincular ${noun} a la historia.` };
  const publicUrl = resolvePublicMediaUrl(result.data.objectKey);
  if (!publicUrl) {
    return { ok: false, error: `Se subió ${noun}, pero no tiene una URL pública.` };
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
      mediaType,
      mimeType: result.data.mimeType,
      publicUrl,
      width: result.data.width,
      height: result.data.height,
      altText: null,
    },
  };
}
