import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { DevCatalogSearchReader } from "@/lib/search/dev-preview-reader";
import { FixtureCatalogSearchReader } from "@/lib/search/fixture-reader";
import { getSearchReader } from "@/lib/search/get-reader";
import { PostgresCatalogSearchReader } from "@/lib/search/postgres-reader";

vi.mock("server-only", () => ({}));

function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("GP-012 — Search Reader Mode Selection & Environment Safety", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    delete process.env.DEV_CATALOG_PREVIEW;
    delete process.env.E2E_CATALOG_FIXTURES;
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.CI;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("defaults to PostgresCatalogSearchReader in normal runtime", () => {
    setNodeEnv("development");
    expect(resolveCatalogReaderMode()).toBe("postgres");
    const reader = getSearchReader();
    expect(reader).toBeInstanceOf(PostgresCatalogSearchReader);
  });

  it("returns DevCatalogSearchReader when DEV_CATALOG_PREVIEW=1 in development", () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";

    expect(resolveCatalogReaderMode()).toBe("dev-preview");
    const reader = getSearchReader();
    expect(reader).toBeInstanceOf(DevCatalogSearchReader);
  });

  it("returns FixtureCatalogSearchReader when E2E_CATALOG_FIXTURES=1 and PLAYWRIGHT_TEST=1", () => {
    setNodeEnv("test");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";

    expect(resolveCatalogReaderMode()).toBe("e2e-fixture");
    const reader = getSearchReader();
    expect(reader).toBeInstanceOf(FixtureCatalogSearchReader);
  });

  it("throws Error if both E2E_CATALOG_FIXTURES and DEV_CATALOG_PREVIEW are enabled", () => {
    setNodeEnv("development");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.DEV_CATALOG_PREVIEW = "1";

    expect(() => resolveCatalogReaderMode()).toThrow(/Ambiguous catalog reader configuration/);
  });

  it("throws Error if DEV_CATALOG_PREVIEW=1 is set in CI", () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    process.env.CI = "true";

    expect(() => resolveCatalogReaderMode()).toThrow(/must NEVER be enabled in CI/);
  });

  it("throws Error if DEV_CATALOG_PREVIEW=1 is set in production", () => {
    setNodeEnv("production");
    process.env.DEV_CATALOG_PREVIEW = "1";

    expect(() => resolveCatalogReaderMode()).toThrow(/only allowed in development/);
  });
});
