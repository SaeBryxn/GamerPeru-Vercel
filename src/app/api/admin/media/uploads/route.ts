import { requestUploadSchema } from "@/lib/media/upload-api-schema";
import {
  guardAdminMediaRequest,
  mediaJson,
  mediaRouteError,
} from "@/lib/admin/media/upload-route-guard";
import { requestGalleryImageUpload } from "@/lib/admin/catalog/gallery-media-service";
import { requestStoryImageUpload } from "@/lib/admin/catalog/story-media-service";
import { requestHomeMediaUpload } from "@/lib/home/home-media-service";

export async function POST(request: Request): Promise<Response> {
  try {
    const guard = await guardAdminMediaRequest(request, "catalog:manage");
    if (!guard.ok) return guard.response;
    const parsed = requestUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return mediaJson({ error: "Datos de subida no válidos.", code: "INVALID_BODY" }, 400);
    const input = parsed.data;
    const options = { authContext: guard.authContext };
    const data =
      input.purpose === "gallery_image"
        ? await requestGalleryImageUpload(input, options)
        : input.purpose === "story_image"
          ? await requestStoryImageUpload(input, options)
          : await requestHomeMediaUpload(input, options);
    return mediaJson({
      uploadId: data.uploadToken,
      putUrl: data.presignedPutUrl,
      requiredHeaders: data.requiredHeaders,
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    return mediaRouteError(error);
  }
}
