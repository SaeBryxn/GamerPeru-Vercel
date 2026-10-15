import { describe, expect, it, vi } from "vitest";
import {
  confirmGalleryImageUpload,
  requestGalleryImageUpload,
} from "@/lib/admin/catalog/gallery-media-service";
import { requestDirectUpload } from "@/lib/admin/media/direct-upload-service";
import type { CatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import { DIRECT_UPLOAD_POLICIES, checkDirectUpload } from "@/lib/media/direct-upload-policy";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

vi.mock("@/lib/storage/r2", () => ({ R2_BUCKETS: { PUBLIC_MEDIA: "public-media" } }));

const SECRET = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";
const NOW = 1_800_000_000;
const MB = 1024 * 1024;
const PRODUCT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f";
const VARIANT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e1a";
const OTHER_PRODUCT_ID = "0190f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e2b";

const ADMIN: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "admin-1",
  email: null,
  roles: [],
  permissions: new Set(["catalog:manage"]),
};

function storage(head: { contentLength: number; contentType?: string } | null = null) {
  return {
    generatePresignedPutUrl: vi.fn(async (params: { bucket: string; key: string }) => {
      return `https://r2.example/${params.bucket}/${params.key}`;
    }),
    headObject: vi.fn(async () => head),
    deleteObject: vi.fn(async () => undefined),
  } as unknown as CatalogStorageAdapter & {
    generatePresignedPutUrl: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };
}

/** A query builder whose awaited result is the next queued row set. */
function fakeDatabase(selects: unknown[][]) {
  const queue = [...selects];
  const inserts: Record<string, unknown>[] = [];
  const chain = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "limit", "for"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(queue.shift() ?? []).then(resolve);
    return builder;
  };
  const tx = {
    select: () => chain(),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserts.push(row);
        const returning = async () => [{ id: `row-${inserts.length}`, ...row }];
        return Object.assign(Promise.resolve(), { returning });
      },
    }),
  };
  const database = {
    ...tx,
    transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  } as never;
  return { database, inserts };
}

const PRODUCT_ROW = { productSlug: "atk-a9-pro-max", brandSlug: "atk" };

async function sign(variantId: string | null, adapter = storage()) {
  const lookups: unknown[][] = [[PRODUCT_ROW]];
  if (variantId) lookups.push([{ productId: PRODUCT_ID }]);
  const { database } = fakeDatabase(lookups);
  return requestGalleryImageUpload(
    { productId: PRODUCT_ID, variantId, mimeType: "image/webp", fileSizeBytes: 2 * MB },
    { authContext: ADMIN, storageAdapter: adapter, intentSecret: SECRET, nowSeconds: NOW, database }
  );
}

describe("Gallery upload policy", () => {
  it("accepts only the browser-prepared WebP or JPEG up to 4 MB, always re-encoded", () => {
    const policy = DIRECT_UPLOAD_POLICIES.gallery_image;
    expect(Object.keys(policy.mimeTypes)).toEqual(["image/webp", "image/jpeg"]);
    expect(policy.maxImageDimension).toBe(2000);
    expect(policy.alwaysReencode).toBe(true);
    expect(checkDirectUpload("gallery_image", { type: "image/png", size: MB })?.code).toBe(
      "DIRECT_UPLOAD_UNSUPPORTED_TYPE"
    );
    expect(checkDirectUpload("gallery_image", { type: "image/webp", size: 4 * MB + 1 })?.code).toBe(
      "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED"
    );
  });
});

describe("Gallery upload signing", () => {
  it("signs a PUT at a fresh key in the product folder", async () => {
    const adapter = storage();
    await sign(null, adapter);
    const call = adapter.generatePresignedPutUrl.mock.calls[0]![0] as {
      key: string;
      contentLength: number;
    };
    expect(call.key).toMatch(/^products\/atk\/atk-a9-pro-max\/[0-9a-f-]{36}\.webp$/);
    expect(call.contentLength).toBe(2 * MB);
  });

  it("refuses a variant of another product", async () => {
    const { database } = fakeDatabase([[PRODUCT_ROW], [{ productId: OTHER_PRODUCT_ID }]]);
    await expect(
      requestGalleryImageUpload(
        { productId: PRODUCT_ID, variantId: VARIANT_ID, mimeType: "image/webp", fileSizeBytes: MB },
        { authContext: ADMIN, storageAdapter: storage(), intentSecret: SECRET, database }
      )
    ).rejects.toMatchObject({ code: "MEDIA_VARIANT_PRODUCT_MISMATCH" });
  });

  it("refuses an unknown product", async () => {
    const { database } = fakeDatabase([[]]);
    await expect(
      requestGalleryImageUpload(
        { productId: PRODUCT_ID, mimeType: "image/webp", fileSizeBytes: MB },
        { authContext: ADMIN, storageAdapter: storage(), intentSecret: SECRET, database }
      )
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });
});

describe("Gallery upload confirmation", () => {
  const verified = () => storage({ contentLength: 2 * MB, contentType: "image/webp" });

  it("attaches the photo after the gallery, to its signed variant, and audits it", async () => {
    const { uploadToken } = await sign(VARIANT_ID);
    const { database, inserts } = fakeDatabase([
      [{ id: PRODUCT_ID }], // product row lock
      [{ productId: PRODUCT_ID }], // variant still belongs to the product
      [], // no asset for this key yet
      [], // not attached yet
      [{ maxOrder: 4 }], // current last gallery position
    ]);
    const result = await confirmGalleryImageUpload(
      { uploadToken, width: 2000, height: 1500, mutationRequestId: "mr-1" },
      {
        authContext: ADMIN,
        storageAdapter: verified(),
        intentSecret: SECRET,
        nowSeconds: NOW,
        database,
      }
    );

    expect(result.replayed).toBe(false);
    expect(inserts[0]).toMatchObject({
      mediaType: "IMAGE",
      mimeType: "image/webp",
      fileSizeBytes: 2 * MB,
      width: 2000,
      height: 1500,
    });
    // No content hash: the Worker never sees the bytes.
    expect(inserts[0]).not.toHaveProperty("checksumSha256");
    expect(inserts[1]).toMatchObject({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      displayOrder: 5,
      placement: "GALLERY",
    });
    expect(inserts[2]).toMatchObject({
      action: "catalog:media:attach",
      metadata: { upload: "direct", variant_id: VARIANT_ID, mutation_request_id: "mr-1" },
    });
  });

  it("returns the existing attachment on a repeated confirm", async () => {
    const { uploadToken } = await sign(null);
    const { database, inserts } = fakeDatabase([
      [{ id: PRODUCT_ID }],
      [{ id: "asset-1", objectKey: "k", mimeType: "image/webp" }], // asset already registered
      [{ id: "pm-1" }], // already attached
    ]);
    const result = await confirmGalleryImageUpload(
      { uploadToken },
      {
        authContext: ADMIN,
        storageAdapter: verified(),
        intentSecret: SECRET,
        nowSeconds: NOW,
        database,
      }
    );
    expect(result).toEqual({ productMediaId: "pm-1", mediaAssetId: "asset-1", replayed: true });
    expect(inserts).toHaveLength(0);
  });

  it("rejects a token signed for another kind of upload", async () => {
    const { uploadToken } = await requestDirectUpload(
      {
        purpose: "story_image",
        actorId: "admin-1",
        subjectId: PRODUCT_ID,
        keyPrefix: "products/atk/atk-a9-pro-max/story",
        mimeType: "image/webp",
        fileSizeBytes: MB,
      },
      { storageAdapter: storage(), intentSecret: SECRET, nowSeconds: NOW }
    );
    await expect(
      confirmGalleryImageUpload(
        { uploadToken },
        { authContext: ADMIN, storageAdapter: verified(), intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_PURPOSE_MISMATCH" });
  });

  it("deletes an object whose size differs from what was signed", async () => {
    const { uploadToken } = await sign(null);
    const adapter = storage({ contentLength: 2 * MB + 10, contentType: "image/webp" });
    await expect(
      confirmGalleryImageUpload(
        { uploadToken },
        { authContext: ADMIN, storageAdapter: adapter, intentSecret: SECRET, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_MISMATCH" });
    expect(adapter.deleteObject).toHaveBeenCalledTimes(1);
  });
});
