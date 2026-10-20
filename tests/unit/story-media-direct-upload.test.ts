import { fixtureHeader } from "../helpers/media-upload-ledger-mock";
import { describe, expect, it, vi } from "vitest";
import {
  confirmStoryImageUpload,
  requestStoryImageUpload,
} from "@/lib/admin/catalog/story-media-service";
import type { CatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2-buckets", () => ({ R2_BUCKETS: { PUBLIC_MEDIA: "public-media" } }));

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
    getObjectRange: vi.fn(async () => fixtureHeader(head?.contentType ?? "image/webp")),
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
  return {
    select: () => chain,
    transaction: async (fn: (tx: object) => unknown) => fn({}),
  } as never;
}

async function issueToken(adapter = storage(null), actor = admin()) {
  return requestStoryImageUpload(
    { productId: PRODUCT_ID, mimeType: "image/jpeg", fileSizeBytes: 2_000_000 },
    {
      authContext: actor,
      storageAdapter: adapter,
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

  it("obtiene el estado bajo bloqueo antes de registrar la imagen", async () => {
    const adapter = storage({ contentLength: 2_000_000, contentType: "image/jpeg" });
    const { uploadId } = await issueToken(adapter);
    const rows: unknown[][] = [
      [{ id: PRODUCT_ID, status: "PUBLISHED" }],
      [],
      [],
      [{ maxOrder: 0 }],
    ];
    const locked = vi.fn();
    const chain = () => {
      const builder: Record<string, unknown> = {};
      for (const method of ["from", "where"]) builder[method] = () => builder;
      builder.for = (mode: string) => {
        locked(mode);
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(rows.shift() ?? []).then(resolve);
      return builder;
    };
    let id = 0;
    const tx = {
      select: chain,
      insert: () => ({
        values: (value: Record<string, unknown>) =>
          Object.assign(Promise.resolve(), {
            returning: async () => [{ id: `row-${++id}`, ...value }],
          }),
      }),
    };
    const database = { transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as never;
    const result = await confirmStoryImageUpload(
      { uploadId, width: 100, height: 100 },
      {
        authContext: admin(),
        storageAdapter: adapter,
        nowSeconds: NOW,
        database,
      }
    );
    expect(result.productStatus).toBe("PUBLISHED");
    expect(locked).toHaveBeenCalledWith("update");
  });

  it("rejects unsupported types and oversize files before signing anything", async () => {
    const adapter = storage(null);
    const options = {
      authContext: admin(),
      storageAdapter: adapter,
      database: productLookup({ productSlug: "p", brandSlug: "b" }),
    };
    await expect(
      requestStoryImageUpload(
        { productId: PRODUCT_ID, mimeType: "image/gif", fileSizeBytes: 10 },
        options
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_UNSUPPORTED_TYPE" });
    await expect(
      requestStoryImageUpload(
        { productId: PRODUCT_ID, mimeType: "image/png", fileSizeBytes: 10485761 },
        options
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_SIZE_LIMIT_EXCEEDED" });
    expect(adapter.generatePresignedPutUrl).not.toHaveBeenCalled();
  });

  it("refuses a token issued to another session", async () => {
    const { uploadId } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadId },
        {
          authContext: admin("someone-else"),
          storageAdapter: storage(null),
          nowSeconds: NOW,
        }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_ACTOR_MISMATCH" });
  });

  it("reports a missing object without registering anything", async () => {
    const { uploadId } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadId },
        {
          authContext: admin(),
          storageAdapter: storage(null),
          nowSeconds: NOW,
        }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_NOT_FOUND" });
  });

  it("deletes an object whose type or size does not match what was signed", async () => {
    const { uploadId } = await issueToken();
    const wrongType = storage({ contentLength: 2_000_000, contentType: "text/html" });
    await expect(
      confirmStoryImageUpload(
        { uploadId },
        { authContext: admin(), storageAdapter: wrongType, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_MISMATCH" });
    expect(wrongType.deleteObject).toHaveBeenCalledTimes(1);

    const { uploadId: tooLargeId } = await issueToken();
    const tooLarge = storage({ contentLength: 10485761, contentType: "image/jpeg" });
    await expect(
      confirmStoryImageUpload(
        { uploadId: tooLargeId },
        { authContext: admin(), storageAdapter: tooLarge, nowSeconds: NOW }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_MISMATCH" });
    expect(tooLarge.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("expires tokens after the upload window", async () => {
    const { uploadId } = await issueToken();
    await expect(
      confirmStoryImageUpload(
        { uploadId },
        {
          authContext: admin(),
          storageAdapter: storage(null),
          nowSeconds: NOW + 16 * 60,
        }
      )
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_EXPIRED" });
  });
});

vi.mock(
  "@/lib/admin/media/upload-ledger",
  async () => await import("../helpers/media-upload-ledger-mock")
);
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
