import { describe, expect, it, vi } from "vitest";
import {
  confirmStoryImageUpload,
  requestStoryImageUpload,
} from "@/lib/admin/catalog/story-media-service";
import type { CatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({ R2_BUCKETS: { PUBLIC_MEDIA: "public-media" } }));

const SECRET = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";
const PRODUCT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f";
const NOW = 1_800_000_000;

function admin(id = "admin-1"): VerifiedAuthContextReady {
  return {
    status: "READY",
    authUserId: id,
    email: null,
    roles: [],
    permissions: new Set(["catalog:manage"]),
  };
}

function storage(head: { contentLength: number; contentType?: string } | null) {
  return {
    generatePresignedPutUrl: vi.fn(async (params: { bucket: string; key: string }) => {
      return `https://r2.example/${params.bucket}/${params.key}`;
    }),
    headObject: vi.fn(async () => head),
    deleteObject: vi.fn(async () => undefined),
  } as unknown as CatalogStorageAdapter & {
    generatePresignedPutUrl: ReturnType<typeof vi.fn>;
    headObject: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };
}

/** A database whose product lookup resolves to the given row. */
function productLookup(row: { productSlug: string; brandSlug: string } | undefined) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(row ? [row] : []),
  };
  return { select: () => chain } as never;
}

async function issueToken(adapter = storage(null), actor = admin()) {
  return requestStoryImageUpload(
    { productId: PRODUCT_ID, mimeType: "image/jpeg", fileSizeBytes: 2_000_000 },
    {
      authContext: actor,
      storageAdapter: adapter,
      intentSecret: SECRET,
      nowSeconds: NOW,
      database: productLookup({ productSlug: "atk-a9", brandSlug: "atk" }),
    }
  );
}

describe("story image direct upload", () => {
  it("signs a PUT straight into the public bucket at a product-scoped story key", async () => {
    const adapter = storage(null);
    const result = await issueToken(adapter);

    const call = adapter.generatePresignedPutUrl.mock.calls[0]![0];
    expect(call.bucket).toBe("public-media");
    expect(call.key).toMatch(/^products\/atk\/atk-a9\/story\/[0-9a-f-]{36}\.jpg$/);
    expect(call.contentType).toBe("image/jpeg");
    expect(result.requiredHeaders).toEqual({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  it("rejects unsupported types and oversize files before signing anything", async () => {
    const adapter = storage(null);
    const options = {
      authContext: admin(),
      storageAdapter: adapter,
      intentSecret: SECRET,
      database: productLookup({ productSlug: "p", brandSlug: "b" }),
    };
    await expect(
      requestStoryImageUpload(
        { productId: PRODUCT_ID, mimeType: "image/gif", fileSizeBytes: 10 },
        options
      )
    ).rejects.toMatchObject({ code: "MEDIA_UNSUPPORTED_TYPE" });
    await expect(
      requestStoryImageUpload(
        { productId: PRODUCT_ID, mimeType: "image/png", fileSizeBytes: 10485761 },
        options
      )
    ).rejects.toMatchObject({ code: "MEDIA_SIZE_LIMIT_EXCEEDED" });
    expect(adapter.generatePresignedPutUrl).not.toHaveBeenCalled();
  });

  it("refuses a tampered token", async () => {
    const { uploadToken } = await issueToken();
    const [body] = uploadToken.split(".");
    await expect(
      confirmStoryImageUpload(
        { uploadToken: `${body}.${"0".repeat(64)}` },
        {
          authContext: admin(),
          storageAdapter: storage(null),
          intentSecret: SECRET,
          nowSeconds: NOW,
        }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_TOKEN_INVALID" });
  });

  it("refuses a token issued to another session", async () => {
    const { uploadToken } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadToken },
        {
          authContext: admin("someone-else"),
          storageAdapter: storage(null),
          intentSecret: SECRET,
          nowSeconds: NOW,
        }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_ACTOR_MISMATCH" });
  });

  it("reports a missing object without registering anything", async () => {
    const { uploadToken } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadToken },
        {
          authContext: admin(),
          storageAdapter: storage(null),
          intentSecret: SECRET,
          nowSeconds: NOW,
        }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_NOT_FOUND" });
  });

  it("deletes an object whose type or size does not match what was signed", async () => {
    const { uploadToken } = await issueToken();
    const wrongType = storage({ contentLength: 2_000_000, contentType: "text/html" });
    await expect(
      confirmStoryImageUpload(
        { uploadToken },
        { authContext: admin(), storageAdapter: wrongType, intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_MISMATCH" });
    expect(wrongType.deleteObject).toHaveBeenCalledTimes(1);

    const tooLarge = storage({ contentLength: 10485761, contentType: "image/jpeg" });
    await expect(
      confirmStoryImageUpload(
        { uploadToken },
        { authContext: admin(), storageAdapter: tooLarge, intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_MISMATCH" });
    expect(tooLarge.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("expires tokens after the upload window", async () => {
    const { uploadToken } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadToken },
        {
          authContext: admin(),
          storageAdapter: storage(null),
          intentSecret: SECRET,
          nowSeconds: NOW + 16 * 60,
        }
      )
    ).rejects.toMatchObject({ code: "STORY_UPLOAD_TOKEN_EXPIRED" });
  });
});
