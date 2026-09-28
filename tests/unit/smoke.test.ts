import { describe, it, expect } from "vitest";
import { publicEnv, resolvePublicEnv, validatePublicEnv } from "@/config/public-env";
import { validateServerEnv } from "@/config/server-env";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { inngest } from "@/lib/inngest/client";

describe("GP-005 Smoke Tests", () => {
  it("validates default public environment configuration", () => {
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBeDefined();
  });

  it("validates real public environment parser against valid and invalid payloads", () => {
    const valid = validatePublicEnv({
      NEXT_PUBLIC_SITE_URL: "https://gamerperu.com",
      NEXT_PUBLIC_CDN_URL: "https://media.gamerperu.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_token_123",
    });
    expect(valid.NEXT_PUBLIC_SITE_URL).toBe("https://gamerperu.com");
    expect(valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_test_token_123");

    expect(() =>
      validatePublicEnv({
        NEXT_PUBLIC_SITE_URL: "invalid-url-format",
      })
    ).toThrow();
  });

  describe("public environment on deployments", () => {
    const deployed = {
      NEXT_PUBLIC_SITE_URL: "https://gamerperu.com",
      NEXT_PUBLIC_CDN_URL: "https://media.gamerperu.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_token_123",
    };

    it("falls back to local defaults for absent or blank values outside a deployment", () => {
      const env = resolvePublicEnv(
        { NEXT_PUBLIC_SITE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  " },
        { requireDeploymentValues: false }
      );
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
      expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_placeholder_key");
    });

    it("names every absent or blank required variable on a deployment", () => {
      expect(() =>
        resolvePublicEnv(
          { ...deployed, NEXT_PUBLIC_CDN_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
          { requireDeploymentValues: true }
        )
      ).toThrow(
        "Missing public environment variables for this deployment: NEXT_PUBLIC_CDN_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
      );
    });

    it("accepts complete deployment values, trimming surrounding whitespace", () => {
      const env = resolvePublicEnv(
        { ...deployed, NEXT_PUBLIC_SITE_URL: " https://gamerperu.com " },
        { requireDeploymentValues: true }
      );
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://gamerperu.com");
      expect(env.NEXT_PUBLIC_WHATSAPP_NUMBER).toBeUndefined();
    });

    it("still rejects malformed URLs on a deployment", () => {
      expect(() =>
        resolvePublicEnv(
          { ...deployed, NEXT_PUBLIC_SITE_URL: "gamerperu.com" },
          { requireDeploymentValues: true }
        )
      ).toThrow();
    });
  });

  it("validates real server environment parser succeeds with AI config absent or with placeholders and enforces production constraints", () => {
    // Valid development payload with AI config absent
    const validDevNoAi = validateServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(validDevNoAi.NODE_ENV).toBe("development");

    // Valid development payload even with AI placeholder values present in env
    const validDevWithPlaceholders = validateServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      AI_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
      AI_ENCRYPTION_KEY_V1: "replace_with_real_64_hex_secret",
    });
    expect(validDevWithPlaceholders.NODE_ENV).toBe("development");

    // Rejects default localhost DATABASE_URL in production environment
    expect(() =>
      validateServerEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      })
    ).toThrow();

    // Accepts valid production DATABASE_URL and DATABASE_MIGRATION_URL in production environment
    const validProd = validateServerEnv({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgres://db_user:secret_pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
      DATABASE_MIGRATION_URL:
        "postgres://db_user:secret_pass@db.xyzproject.supabase.co:5432/postgres",
    });
    expect(validProd.NODE_ENV).toBe("production");
    expect(validProd.DATABASE_MIGRATION_URL).toBe(
      "postgres://db_user:secret_pass@db.xyzproject.supabase.co:5432/postgres"
    );
  });

  it("exposes canonical Cloudflare R2 bucket definitions", () => {
    expect(R2_BUCKETS.PUBLIC_MEDIA).toBe("gamerperu-public-media");
    expect(R2_BUCKETS.PRIVATE_PROOFS).toBe("gamerperu-private-proofs");
    expect(R2_BUCKETS.DB_BACKUPS).toBe("gamerperu-db-backups-private");
  });

  it("initializes Inngest client with canonical id", () => {
    expect(inngest.id).toBe("gamer-peru");
  });

  it("verifies Peruvian Soles integer minor units math invariant", () => {
    // S/ 129.90 -> 12990 minor units
    const priceCents = 12990;
    const formatted = (priceCents / 100).toLocaleString("es-PE", {
      style: "currency",
      currency: "PEN",
    });
    expect(formatted).toContain("129");
  });
});
