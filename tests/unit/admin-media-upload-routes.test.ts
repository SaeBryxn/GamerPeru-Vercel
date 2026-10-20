import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as init } from "@/app/api/admin/media/uploads/route";
import { POST as complete } from "@/app/api/admin/media/uploads/complete/route";
import type { VerifiedAuthContext } from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  gallery: vi.fn(),
  story: vi.fn(),
  home: vi.fn(),
  galleryComplete: vi.fn(),
  storyComplete: vi.fn(),
  homeComplete: vi.fn(),
  tag: vi.fn(),
  path: vi.fn(),
}));
vi.mock("@/config/public-env", () => ({
  publicEnv: {
    NEXT_PUBLIC_SITE_URL: "https://gamerperu.test",
    NEXT_PUBLIC_CDN_URL: "https://media.gamerperu.test",
  },
}));
vi.mock("@/lib/auth/rbac", () => ({ getVerifiedAuthContext: mocks.auth }));
vi.mock("@/lib/admin/catalog/gallery-media-service", () => ({
  requestGalleryImageUpload: mocks.gallery,
  confirmGalleryImageUpload: mocks.galleryComplete,
}));
vi.mock("@/lib/admin/catalog/story-media-service", () => ({
  requestStoryImageUpload: mocks.story,
  confirmStoryImageUpload: mocks.storyComplete,
}));
vi.mock("@/lib/home/home-media-service", () => ({
  requestHomeMediaUpload: mocks.home,
  confirmHomeMediaUpload: mocks.homeComplete,
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }));
const productId = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f";
const body = { purpose: "gallery_image", productId, mimeType: "image/webp", fileSizeBytes: 10 };
function request(payload: unknown = body, origin = "https://gamerperu.test") {
  return new Request("https://gamerperu.test/api/admin/media/uploads", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    status: "READY",
    authUserId: productId,
    permissions: new Set(["catalog:manage"]),
  } satisfies Partial<VerifiedAuthContext>);
  const signed = {
    uploadToken: "token",
    presignedPutUrl: "https://r2.test/x",
    requiredHeaders: {},
    expiresAt: 100,
  };
  mocks.gallery.mockResolvedValue(signed);
  mocks.story.mockResolvedValue(signed);
  mocks.home.mockResolvedValue(signed);
});
describe("rutas de control de medios", () => {
  it("rechaza origen ajeno antes de resolver sesión", async () => {
    expect((await init(request(body, "https://ajeno.test"))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("exige sesión y permiso", async () => {
    mocks.auth.mockResolvedValueOnce({ status: "UNAUTHENTICATED" });
    expect((await init(request())).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ status: "READY", permissions: new Set() });
    expect((await init(request())).status).toBe(403);
  });
  it("valida el body y no permite campos ajenos", async () => {
    expect((await init(request({ ...body, productId: "invalid" }))).status).toBe(400);
    expect((await init(request({ ...body, unexpected: true }))).status).toBe(400);
  });
  it.each(["gallery_image", "story_image", "home_image", "home_video", "home_video_poster"])(
    "despacha %s al servicio correcto",
    async (purpose) => {
      const response = await init(
        request({
          purpose,
          ...(purpose.startsWith("home") ? {} : { productId }),
          mimeType: body.mimeType,
          fileSizeBytes: 10,
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        uploadId: "token",
        putUrl: "https://r2.test/x",
        expiresAt: 100,
      });
      expect(
        purpose === "gallery_image"
          ? mocks.gallery
          : purpose === "story_image"
            ? mocks.story
            : mocks.home
      ).toHaveBeenCalledOnce();
    }
  );
  it.each(["DRAFT", "ARCHIVED", "PUBLISHED"])(
    "confirmar %s solo invalida datos publicados",
    async (status) => {
      mocks.galleryComplete.mockResolvedValue({
        productStatus: status,
        objectKey: "foto.webp",
        mediaAssetId: "asset",
      });
      const response = await complete(request({ purpose: "gallery_image", uploadId: "token" }));
      expect(response.status).toBe(200);
      expect(mocks.path).not.toHaveBeenCalled();
      if (status === "PUBLISHED")
        expect(mocks.tag).toHaveBeenCalledWith("storefront-catalog", { expire: 0 });
      else expect(mocks.tag).not.toHaveBeenCalled();
    }
  );
  it("no filtra errores internos", async () => {
    mocks.gallery.mockRejectedValue(new Error("password=secret"));
    const response = await init(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
