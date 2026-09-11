import type { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { R2CatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";

const HEAD_PARAMS = { bucket: "catalog-staging-test", key: "temp/catalog/test-object" };

function createAdapter(send: ReturnType<typeof vi.fn>): R2CatalogStorageAdapter {
  return new R2CatalogStorageAdapter({ send } as unknown as S3Client);
}

describe("GP-024 R2 catalog HEAD semantics", () => {
  beforeAll(() => {
    vi.stubEnv("R2_ACCOUNT_ID", "unit-test-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "unit-test-access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "unit-test-secret-key");
    vi.stubEnv("R2_PUBLIC_MEDIA_BUCKET", "unit-test-public-media");
    vi.stubEnv("R2_CATALOG_STAGING_BUCKET", "unit-test-catalog-staging");
    vi.stubEnv(
      "CATALOG_MEDIA_INTENT_HMAC_SECRET",
      "b1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0"
    );
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("returns null only for an authoritative 404 / NotFound response", async () => {
    const send = vi.fn().mockRejectedValue({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });

    await expect(createAdapter(send).headObject(HEAD_PARAMS)).resolves.toBeNull();
  });

  it("propagates a 403 authorization response", async () => {
    const error = { name: "NotFound", $metadata: { httpStatusCode: 403 } };
    const send = vi.fn().mockRejectedValue(error);

    await expect(createAdapter(send).headObject(HEAD_PARAMS)).rejects.toBe(error);
  });

  it("propagates a 500 storage response", async () => {
    const error = { name: "InternalError", $metadata: { httpStatusCode: 500 } };
    const send = vi.fn().mockRejectedValue(error);

    await expect(createAdapter(send).headObject(HEAD_PARAMS)).rejects.toBe(error);
  });

  it("propagates a network exception", async () => {
    const error = new Error("simulated network failure");
    const send = vi.fn().mockRejectedValue(error);

    await expect(createAdapter(send).headObject(HEAD_PARAMS)).rejects.toBe(error);
  });

  it("fails closed when a successful HEAD omits ContentLength", async () => {
    const send = vi.fn().mockResolvedValue({ ContentType: "image/webp" });

    await expect(createAdapter(send).headObject(HEAD_PARAMS)).rejects.toThrow(
      /omitted ContentLength/
    );
  });
});
