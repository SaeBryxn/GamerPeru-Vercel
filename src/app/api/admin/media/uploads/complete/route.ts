import { completeUploadSchema } from "@/lib/media/upload-api-schema";
import {
  guardAdminMediaRequest,
  mediaJson,
  mediaRouteError,
} from "@/lib/admin/media/upload-route-guard";
import { confirmGalleryImageUpload } from "@/lib/admin/catalog/gallery-media-service";
import { confirmStoryImageUpload } from "@/lib/admin/catalog/story-media-service";
import { confirmHomeMediaUpload } from "@/lib/home/home-media-service";
import { revalidateStorefrontCatalogData } from "@/lib/catalog/catalog-cache";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

export async function POST(request: Request): Promise<Response> {
  try {
    const guard = await guardAdminMediaRequest(request, "catalog:manage");
    if (!guard.ok) return guard.response;
    const parsed = completeUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return mediaJson({ error: "Datos de confirmación no válidos.", code: "INVALID_BODY" }, 400);
    const input = { ...parsed.data, uploadToken: parsed.data.uploadId };
    const options = { authContext: guard.authContext };
    if (input.purpose === "gallery_image" || input.purpose === "story_image") {
      const data =
        input.purpose === "gallery_image"
          ? await confirmGalleryImageUpload(input, options)
          : await confirmStoryImageUpload(input, options);
      if (data.productStatus === "PUBLISHED") revalidateStorefrontCatalogData();
      return mediaJson({ ...data, src: resolvePublicMediaUrl(data.objectKey) });
    }
    const data = await confirmHomeMediaUpload(input, options);
    return mediaJson({ ...data, src: resolvePublicMediaUrl(data.objectKey) });
  } catch (error) {
    return mediaRouteError(error);
  }
}
