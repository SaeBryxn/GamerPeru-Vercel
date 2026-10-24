import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { requestUploadSchema, completeUploadSchema } from "@/lib/media/upload-api-schema";
import { guardAdminMediaRequest, mediaJson, mediaRouteError } from "./upload-route-guard";
import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";

/*
 * Each upload is for one purpose, so only that purpose's service is loaded. On Workers every
 * module a route imports is compiled on its first request in an isolate, and the confirmation
 * step was being cut by the 10 ms CPU limit; gallery, story and home services stay apart.
 */
const galleryService = () => import("@/lib/admin/catalog/gallery-media-service");
const storyService = () => import("@/lib/admin/catalog/story-media-service");
const homeService = () => import("@/lib/home/home-media-service");
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { abortUpload } from "./upload-ledger";

export async function initAdminMediaUpload(request: Request): Promise<Response> {
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
        ? await (await galleryService()).requestGalleryImageUpload(input, options)
        : input.purpose === "story_image" || input.purpose === "story_video"
          ? await (await storyService()).requestStoryMediaUpload(input, options)
          : await (await homeService()).requestHomeMediaUpload(input, options);
    return mediaJson(data);
  } catch (error) {
    return mediaRouteError(error);
  }
}

export async function completeAdminMediaUpload(request: Request): Promise<Response> {
  try {
    const guard = await guardAdminMediaRequest(request, "catalog:manage");
    if (!guard.ok) return guard.response;
    const parsed = completeUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return mediaJson({ error: "Datos de confirmación no válidos.", code: "INVALID_BODY" }, 400);
    const input = parsed.data;
    const options = { authContext: guard.authContext };
    if (
      input.purpose === "gallery_image" ||
      input.purpose === "story_image" ||
      input.purpose === "story_video"
    ) {
      const data =
        input.purpose === "gallery_image"
          ? await (await galleryService()).confirmGalleryImageUpload(input, options)
          : await (
              await storyService()
            ).confirmStoryMediaUpload({ ...input, purpose: input.purpose }, options);
      if (data.productStatus === "PUBLISHED") revalidateStorefrontCatalog();
      return mediaJson({ ...data, src: resolvePublicMediaUrl(data.objectKey) });
    }
    const data = await (await homeService()).confirmHomeMediaUpload(input, options);
    return mediaJson({ ...data, src: resolvePublicMediaUrl(data.objectKey) });
  } catch (error) {
    return mediaRouteError(error);
  }
}

export async function abortAdminMediaUpload(request: Request): Promise<Response> {
  try {
    const guard = await guardAdminMediaRequest(request, "catalog:manage");
    if (!guard.ok) return guard.response;
    const parsed = z
      .object({ uploadId: z.string().uuid() })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return mediaJson({ error: "Subida no válida.", code: "INVALID_BODY" }, 400);
    await db.transaction((tx) =>
      abortUpload(tx, parsed.data.uploadId, guard.authContext.authUserId)
    );
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mediaRouteError(error);
  }
}
