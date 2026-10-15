import { describe, expect, it } from "vitest";
import {
  KNOWN_INSECURE_EXAMPLE_HMAC_SECRET,
  getCatalogMediaIntentSecret,
  requireCatalogMediaRuntimeConfig,
} from "@/config/server-env";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/admin/catalog/publish-readiness";

describe("Catalog media configuration", () => {
  it("keeps the canonical image MIME authority used by publish readiness", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(["image/webp", "image/png", "image/jpeg"]);
  });

  it("fails closed on the repository example HMAC secret", () => {
    expect(KNOWN_INSECURE_EXAMPLE_HMAC_SECRET).toBe(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    const origEnv = { ...process.env };
    try {
      process.env.R2_ACCOUNT_ID = "test-account-id";
      process.env.R2_ACCESS_KEY_ID = "test-access-key";
      process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
      process.env.R2_PUBLIC_MEDIA_BUCKET = "test-public";
      process.env.CATALOG_MEDIA_INTENT_HMAC_SECRET = KNOWN_INSECURE_EXAMPLE_HMAC_SECRET;

      expect(() => requireCatalogMediaRuntimeConfig()).toThrow(
        /insecure repository example placeholder/i
      );
      expect(() => getCatalogMediaIntentSecret()).toThrow(
        /insecure repository example placeholder/i
      );
    } finally {
      process.env = origEnv;
    }
  });

  it("rejects the non-hex placeholder from .env.example", () => {
    expect(() =>
      getCatalogMediaIntentSecret(
        "replace-with-64-character-hexadecimal-hmac-secret-min-32-bytes-long"
      )
    ).toThrow(/64-character hexadecimal/i);
  });
});
