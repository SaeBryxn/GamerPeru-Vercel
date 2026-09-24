import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Catalog photos are served from the media CDN configured per environment. next/image refuses
 * any host missing from remotePatterns, so an allowlist that does not track NEXT_PUBLIC_CDN_URL
 * silently breaks every product image on the storefront.
 */
describe("next/image allowlist for the media CDN", () => {
  const originalCdn = process.env.NEXT_PUBLIC_CDN_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalCdn === undefined) delete process.env.NEXT_PUBLIC_CDN_URL;
    else process.env.NEXT_PUBLIC_CDN_URL = originalCdn;
    vi.resetModules();
  });

  async function loadPatterns() {
    const mod = await import("../../next.config");
    const config = mod.default as {
      images?: { remotePatterns?: { hostname: string; protocol?: string }[] };
    };
    return config.images?.remotePatterns ?? [];
  }

  it("allows the configured Supabase Storage host", async () => {
    process.env.NEXT_PUBLIC_CDN_URL =
      "https://jpjffalmvlxpufvtvskx.supabase.co/storage/v1/object/public/gamerperu-public-media";
    const patterns = await loadPatterns();
    expect(patterns.map((p) => p.hostname)).toContain("jpjffalmvlxpufvtvskx.supabase.co");
  });

  it("keeps the production media domain regardless of the CDN variable", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com/bucket";
    const patterns = await loadPatterns();
    const hosts = patterns.map((p) => p.hostname);
    expect(hosts).toContain("media.gamerperu.com");
    expect(hosts).toContain("cdn.example.com");
  });

  it("does not add a pattern when no CDN is configured", async () => {
    delete process.env.NEXT_PUBLIC_CDN_URL;
    const patterns = await loadPatterns();
    expect(patterns.map((p) => p.hostname)).toEqual(["media.gamerperu.com"]);
  });

  it("ignores a malformed CDN value instead of breaking the build", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "not a url";
    const patterns = await loadPatterns();
    expect(patterns.map((p) => p.hostname)).toEqual(["media.gamerperu.com"]);
  });
});
