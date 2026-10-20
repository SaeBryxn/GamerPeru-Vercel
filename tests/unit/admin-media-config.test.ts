import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCatalogMediaRuntimeConfig } from "@/config/server-env";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/admin/catalog/publish-readiness";
afterEach(() => vi.unstubAllEnvs());
describe("Configuración de medios", () => {
  it("mantiene los MIME publicables", () =>
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(["image/webp", "image/png", "image/jpeg"]));
  it("requiere credenciales y ya no requiere secreto HMAC", () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
    vi.stubEnv("R2_ACCESS_KEY_ID", "local");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("CATALOG_MEDIA_INTENT_HMAC_SECRET", "");
    expect(requireCatalogMediaRuntimeConfig().r2AccessKeyId).toBe("local");
    vi.stubEnv("R2_ACCESS_KEY_ID", "placeholder_key");
    expect(() => requireCatalogMediaRuntimeConfig()).toThrow("R2_ACCESS_KEY_ID");
  });
});
