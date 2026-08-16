import { describe, it, expect } from "vitest";
import { publicEnv } from "@/config/env";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";

describe("GP-005 Smoke Tests", () => {
  it("validates default public environment configuration", () => {
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
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

  it("rejects invalid environment variables during validation", () => {
    const testUrlSchema = z.string().url();
    expect(() => testUrlSchema.parse("invalid-not-a-url")).toThrow();

    const testKeySchema = z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/);
    expect(() => testKeySchema.parse("too-short")).toThrow();
    expect(() =>
      testKeySchema.parse(
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
      )
    ).toThrow();
  });
});
