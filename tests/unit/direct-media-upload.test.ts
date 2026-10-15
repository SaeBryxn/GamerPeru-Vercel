import { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  R2CatalogStorageAdapter,
  type CatalogStorageAdapter,
} from "@/lib/admin/catalog/media-storage";
import {
  registerDirectUploadAsset,
  requestDirectUpload,
  verifyDirectUpload,
} from "@/lib/admin/media/direct-upload-service";
import {
  DIRECT_UPLOAD_POLICIES,
  checkDirectUpload,
  directUploadAccept,
} from "@/lib/media/direct-upload-policy";
import { confirmHomeMediaUpload, requestHomeMediaUpload } from "@/lib/home/home-media-service";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

vi.mock("@/lib/storage/r2", () => ({ R2_BUCKETS: { PUBLIC_MEDIA: "public-media" } }));

const SECRET = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";
const NOW = 1_800_000_000;
const MB = 1024 * 1024;

function storage(head: { contentLength: number; contentType?: string } | null = null) {
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

type Permission = VerifiedAuthContextReady["permissions"] extends Set<infer P> ? P : never;

function admin(
  id = "admin-1",
  permissions: Permission[] = ["catalog:manage"]
): VerifiedAuthContextReady {
  return {
    status: "READY",
    authUserId: id,
    email: null,
    roles: [],
    permissions: new Set(permissions),
  };
}

async function sign(
  purpose: "story_image" | "home_image" | "home_video" | "home_video_poster",
  mimeType: string,
  fileSizeBytes: number,
  adapter = storage()
) {
  return requestDirectUpload(
    {
      purpose,
      actorId: "admin-1",
      subjectId: null,
      keyPrefix: "home/videos",
      mimeType,
      fileSizeBytes,
    },
    { storageAdapter: adapter, intentSecret: SECRET, nowSeconds: NOW }
  );
}

describe("Direct upload policies", () => {
  it("accept MP4 and WebM videos up to 25 MB and nothing else", () => {
    expect(directUploadAccept("home_video")).toBe("video/mp4,video/webm");
    expect(checkDirectUpload("home_video", { type: "video/webm", size: 25 * MB })).toBeNull();
    expect(checkDirectUpload("home_video", { type: "video/quicktime", size: MB })?.code).toBe(
      "DIRECT_UPLOAD_UNSUPPORTED_TYPE"
    );
    expect(checkDirectUpload("home_video", { type: "video/mp4", size: 25 * MB + 1 })?.code).toBe(
      "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED"
    );
  });

  it("keep posters small and still", () => {
    expect(checkDirectUpload("home_video_poster", { type: "image/png", size: MB })?.code).toBe(
      "DIRECT_UPLOAD_UNSUPPORTED_TYPE"
    );
    expect(
      checkDirectUpload("home_video_poster", { type: "image/webp", size: 2 * MB + 1 })?.code
    ).toBe("DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED");
    expect(DIRECT_UPLOAD_POLICIES.home_video_poster.maxImageDimension).toBe(1920);
  });

  it("compress images in the browser but never videos", () => {
    expect(DIRECT_UPLOAD_POLICIES.home_image.maxImageDimension).toBe(2560);
    expect(DIRECT_UPLOAD_POLICIES.story_image.maxImageDimension).toBe(2560);
    expect(DIRECT_UPLOAD_POLICIES.home_video.maxImageDimension).toBeNull();
  });

  it("reject empty and fractional sizes", () => {
    expect(checkDirectUpload("home_image", { type: "image/webp", size: 0 })).not.toBeNull();
    expect(checkDirectUpload("home_image", { type: "image/webp", size: 1.5 })).not.toBeNull();
  });
});

describe("Direct upload signing", () => {
  it("signs type, caching and exact length into a fresh key", async () => {
    const adapter = storage();
    const result = await sign("home_video", "video/mp4", 20 * MB, adapter);
    const call = adapter.generatePresignedPutUrl.mock.calls[0]![0];
    expect(call.bucket).toBe("public-media");
    expect(call.key).toMatch(/^home\/videos\/[0-9a-f-]{36}\.mp4$/);
    expect(call.contentType).toBe("video/mp4");
    expect(call.contentLength).toBe(20 * MB);
    expect(call.cacheControl).toBe("public, max-age=31536000, immutable");
    expect(result.requiredHeaders["Content-Type"]).toBe("video/mp4");
  });

  it("refuses a disallowed type or size before signing", async () => {
    const adapter = storage();
    await expect(sign("home_video", "video/avi", MB, adapter)).rejects.toMatchObject({
      code: "DIRECT_UPLOAD_UNSUPPORTED_TYPE",
    });
    await expect(sign("home_video", "video/mp4", 26 * MB, adapter)).rejects.toMatchObject({
      code: "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED",
    });
    expect(adapter.generatePresignedPutUrl).not.toHaveBeenCalled();
  });

  it("refuses key prefixes that could escape their folder", async () => {
    for (const keyPrefix of ["../home", "home/../x", "/home", "home/", "Home/Images"]) {
      await expect(
        requestDirectUpload(
          {
            purpose: "home_image",
            actorId: "a",
            subjectId: null,
            keyPrefix,
            mimeType: "image/webp",
            fileSizeBytes: 10,
          },
          { storageAdapter: storage(), intentSecret: SECRET, nowSeconds: NOW }
        ),
        keyPrefix
      ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_INVALID_PREFIX" });
    }
  });
});

describe("Direct upload verification", () => {
  it("accepts an object that matches what was signed exactly", async () => {
    const { uploadToken } = await sign("home_video", "video/webm", 3 * MB);
    const token = await verifyDirectUpload(
      { uploadToken, purpose: "home_video", actorId: "admin-1" },
      {
        storageAdapter: storage({ contentLength: 3 * MB, contentType: "video/webm" }),
        intentSecret: SECRET,
        nowSeconds: NOW,
      }
    );
    expect(token.mimeType).toBe("video/webm");
    expect(token.fileSizeBytes).toBe(3 * MB);
  });

  it("deletes an object of a different length, even a smaller one", async () => {
    const { uploadToken } = await sign("home_video", "video/mp4", 3 * MB);
    const adapter = storage({ contentLength: 3 * MB - 1, contentType: "video/mp4" });
    await expect(
      verifyDirectUpload(
        { uploadToken, purpose: "home_video", actorId: "admin-1" },
        { storageAdapter: adapter, intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_MISMATCH" });
    expect(adapter.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("refuses a token signed for another purpose", async () => {
    const { uploadToken } = await sign("home_video_poster", "image/webp", MB);
    await expect(
      verifyDirectUpload(
        { uploadToken, purpose: "home_video", actorId: "admin-1" },
        { storageAdapter: storage(), intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_PURPOSE_MISMATCH" });
  });

  it("refuses a token whose payload was edited", async () => {
    const { uploadToken } = await sign("home_video", "video/mp4", MB);
    const [body, signature] = uploadToken.split(".");
    const payload = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    payload.fileSizeBytes = 500 * MB;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
    await expect(
      verifyDirectUpload(
        { uploadToken: forged, purpose: "home_video", actorId: "admin-1" },
        { storageAdapter: storage(), intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_TOKEN_INVALID" });
  });
});

describe("Direct upload asset registration", () => {
  function fakeExecutor(existing: unknown[]) {
    const inserted: unknown[] = [];
    const executor = {
      select: () => ({ from: () => ({ where: async () => existing }) }),
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { returning: async () => [{ id: "asset-1", ...row }] };
        },
      }),
    };
    return { executor: executor as never, inserted };
  }

  it("records videos as VIDEO with the signed size and bounded dimensions", async () => {
    const { uploadToken } = await sign("home_video", "video/mp4", 4 * MB);
    const token = await verifyDirectUpload(
      { uploadToken, purpose: "home_video", actorId: "admin-1" },
      {
        storageAdapter: storage({ contentLength: 4 * MB, contentType: "video/mp4" }),
        intentSecret: SECRET,
        nowSeconds: NOW,
      }
    );
    const { executor, inserted } = fakeExecutor([]);
    const { created } = await registerDirectUploadAsset(executor, token, {
      width: 1920,
      height: 99999,
    });
    expect(created).toBe(true);
    expect(inserted[0]).toMatchObject({
      mediaType: "VIDEO",
      mimeType: "video/mp4",
      fileSizeBytes: 4 * MB,
      securityClass: "PUBLIC_MEDIA",
      width: 1920,
      height: null,
    });
  });

  it("returns the existing asset on a repeated confirm", async () => {
    const { uploadToken } = await sign("home_image", "image/webp", MB);
    const token = await verifyDirectUpload(
      { uploadToken, purpose: "home_image", actorId: "admin-1" },
      {
        storageAdapter: storage({ contentLength: MB, contentType: "image/webp" }),
        intentSecret: SECRET,
        nowSeconds: NOW,
      }
    );
    const { executor, inserted } = fakeExecutor([{ id: "existing" }]);
    const result = await registerDirectUploadAsset(executor, token, {});
    expect(result).toMatchObject({ created: false, asset: { id: "existing" } });
    expect(inserted).toHaveLength(0);
  });
});

describe("Home media uploads", () => {
  it("place each purpose in its own folder", async () => {
    const adapter = storage();
    const options = {
      authContext: admin(),
      storageAdapter: adapter,
      intentSecret: SECRET,
      nowSeconds: NOW,
    };
    await requestHomeMediaUpload(
      { purpose: "home_image", mimeType: "image/webp", fileSizeBytes: MB },
      options
    );
    await requestHomeMediaUpload(
      { purpose: "home_video", mimeType: "video/webm", fileSizeBytes: MB },
      options
    );
    await requestHomeMediaUpload(
      { purpose: "home_video_poster", mimeType: "image/jpeg", fileSizeBytes: MB },
      options
    );
    const keys = adapter.generatePresignedPutUrl.mock.calls.map(
      (call) => (call[0] as { key: string }).key
    );
    expect(keys[0]).toMatch(/^home\/images\/[0-9a-f-]{36}\.webp$/);
    expect(keys[1]).toMatch(/^home\/videos\/[0-9a-f-]{36}\.webm$/);
    expect(keys[2]).toMatch(/^home\/posters\/[0-9a-f-]{36}\.jpg$/);
  });

  it("refuse story uploads and operators without catalog permission", async () => {
    const base = { storageAdapter: storage(), intentSecret: SECRET, nowSeconds: NOW };
    await expect(
      requestHomeMediaUpload(
        { purpose: "story_image", mimeType: "image/webp", fileSizeBytes: MB },
        { ...base, authContext: admin() }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_PURPOSE_MISMATCH" });
    await expect(
      requestHomeMediaUpload(
        { purpose: "home_image", mimeType: "image/webp", fileSizeBytes: MB },
        { ...base, authContext: admin("viewer", ["orders:verify"]) }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("registers the asset and audits it once", async () => {
    const adapter = storage({ contentLength: 5 * MB, contentType: "video/mp4" });
    const options = {
      authContext: admin(),
      storageAdapter: adapter,
      intentSecret: SECRET,
      nowSeconds: NOW,
    };
    const { uploadToken } = await requestHomeMediaUpload(
      { purpose: "home_video", mimeType: "video/mp4", fileSizeBytes: 5 * MB },
      options
    );

    const audits: Record<string, unknown>[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          if ("action" in row) audits.push(row);
          return {
            returning: async () => [
              { id: "asset-9", mediaType: "VIDEO", width: null, height: null, ...row },
            ],
          };
        },
      }),
    };
    const database = { transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as never;

    const result = await confirmHomeMediaUpload(
      { purpose: "home_video", uploadToken, width: 1920, height: 1080 },
      { ...options, database }
    );
    expect(result).toMatchObject({
      mediaAssetId: "asset-9",
      mediaType: "VIDEO",
      mimeType: "video/mp4",
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "home:media:upload", targetType: "media_asset" });
  });
});

describe("R2 presigned PUT", () => {
  beforeAll(() => {
    vi.stubEnv("R2_ACCOUNT_ID", "unit-test-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "unit-test-access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "unit-test-secret-key");
    vi.stubEnv("R2_PUBLIC_MEDIA_BUCKET", "unit-test-public-media");
    vi.stubEnv("CATALOG_MEDIA_INTENT_HMAC_SECRET", SECRET);
  });
  afterAll(() => vi.unstubAllEnvs());

  it("signs Content-Length so R2 refuses a body of another size", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://unit-test-account.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "secret" },
    });
    const url = new URL(
      await new R2CatalogStorageAdapter(client).generatePresignedPutUrl({
        bucket: "public-media",
        key: "home/videos/x.mp4",
        contentType: "video/mp4",
        cacheControl: "public, max-age=31536000, immutable",
        contentLength: 1234,
        expiresInSeconds: 900,
      })
    );
    const signed = url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    expect(signed).toEqual(
      expect.arrayContaining(["content-length", "content-type", "cache-control"])
    );
  });
});
