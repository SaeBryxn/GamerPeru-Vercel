import { describe, it, expect } from "vitest";
import { publicEnv, validatePublicEnv } from "@/config/public-env";
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

  it("validates real server environment parser against master key invariants and production constraints", () => {
    // Valid development payload with 64-character hex master key
    const validDev = validateServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      AI_ENCRYPTION_KEY_V1: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    expect(validDev.AI_ENCRYPTION_KEY_V1).toHaveLength(64);

    // Rejects non-64-character hex string
    expect(() =>
      validateServerEnv({
        AI_ENCRYPTION_KEY_V1: "too_short",
      })
    ).toThrow();

    // Rejects non-hex characters
    expect(() =>
      validateServerEnv({
        AI_ENCRYPTION_KEY_V1: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      })
    ).toThrow();

    // Rejects default localhost DATABASE_URL in production environment
    expect(() =>
      validateServerEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      })
    ).toThrow();

    // Accepts valid production DATABASE_URL in production environment
    const validProd = validateServerEnv({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgres://db_user:secret_pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    });
    expect(validProd.NODE_ENV).toBe("production");
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
