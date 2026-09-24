import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * GP-011 Post-Closure — Catalog Reader Selection & Dev Preview Reader Tests
 *
 * Tests cover:
 * - Reader factory (getCatalogReader) mode selection and safety guards.
 * - DevCatalogPreviewReader entity resolution and pagination.
 */

// Mock server-only globally for all tests in this file
vi.mock("server-only", () => ({}));

// Helper to assign NODE_ENV without triggering TS read-only error
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

// ---------------------------------------------------------------------------
// Reader Selection Tests
// ---------------------------------------------------------------------------

describe("getCatalogReader — reader selection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Re-register the server-only mock after resetModules
    vi.doMock("server-only", () => ({}));
    // Clear relevant env vars before each test
    delete process.env.E2E_CATALOG_FIXTURES;
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.DEV_CATALOG_PREVIEW;
    delete process.env.CI;
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class MockPostgres {
        _type = "postgres";
      },
    }));
    vi.doMock("../../src/lib/catalog/postgres-product-detail-reader", () => ({
      PostgresProductDetailReader: class MockPostgresProductDetail {
        _type = "postgres-product-detail";
      },
    }));
    vi.doMock("../../src/lib/catalog/fixture-reader", () => ({
      FixtureCatalogDiscoveryReader: class MockFixture {
        _type = "fixture";
      },
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-reader", () => ({
      DevCatalogPreviewReader: class MockDevPreview {
        _type = "dev-preview";
      },
    }));
    vi.doMock("../../src/lib/catalog/postgres-story-related-products-reader", () => ({
      PostgresStoryRelatedProductsReader: class MockPostgresStoryRelated {
        _type = "postgres-story-related";
      },
    }));
    vi.doMock("../../src/lib/catalog/fixture-story-related-products-reader", () => ({
      FixtureStoryRelatedProductsReader: class MockFixtureStoryRelated {
        _type = "fixture-story-related";
      },
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-story-related-products-reader", () => ({
      DevPreviewStoryRelatedProductsReader: class MockDevPreviewStoryRelated {
        _type = "dev-preview-story-related";
      },
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns PostgresCatalogDiscoveryReader when no flags are set (development)", async () => {
    setNodeEnv("development");
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("postgres");
  });

  it("returns DevCatalogPreviewReader when DEV_CATALOG_PREVIEW=1 in development", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("dev-preview");
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in production", async () => {
    setNodeEnv("production");
    process.env.DEV_CATALOG_PREVIEW = "1";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/only allowed in development/);
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in test environment", async () => {
    setNodeEnv("test");
    process.env.DEV_CATALOG_PREVIEW = "1";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/only allowed in development/);
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in CI", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    process.env.CI = "true";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/NEVER be enabled in CI/);
  });

  it("returns FixtureCatalogDiscoveryReader when E2E_CATALOG_FIXTURES=1 + PLAYWRIGHT_TEST=1", async () => {
    setNodeEnv("test");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("fixture");
  });

  it("throws when both E2E_CATALOG_FIXTURES and DEV_CATALOG_PREVIEW are set", async () => {
    setNodeEnv("development");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.DEV_CATALOG_PREVIEW = "1";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/Ambiguous catalog reader configuration/);
  });

  it("returns PostgresCatalogDiscoveryReader when DEV_CATALOG_PREVIEW=0 in development", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "0";
    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("postgres");
  });

  it("returns PostgresProductDetailReader for getProductDetailReader in default mode", async () => {
    setNodeEnv("development");
    const { getProductDetailReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getProductDetailReader();
    expect((reader as unknown as { _type: string })._type).toBe("postgres-product-detail");
  });

  it("returns DevCatalogPreviewReader for getProductDetailReader in preview mode", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    const { getProductDetailReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getProductDetailReader();
    expect((reader as unknown as { _type: string })._type).toBe("dev-preview");
  });
});

// ---------------------------------------------------------------------------
// DevCatalogPreviewReader Tests (direct import, server-only globally mocked)
// ---------------------------------------------------------------------------

import { DevCatalogPreviewReader } from "../../src/lib/catalog/dev-preview-reader";

describe("DevCatalogPreviewReader — entity resolution", () => {
  // Categories
  it("resolves mouses category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mouses");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Mouses Gaming");
    expect(cat!.slug).toBe("mouses");
  });

  it("resolves teclados category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("teclados");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Teclados Gaming");
  });

  it("resolves mousepads category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mousepads");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Mousepads Gaming");
  });

  it("resolves audio category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("audio");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Audio Gaming");
  });

  it("resolves accesorios category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("accesorios");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Accesorios Gaming");
  });

  it("returns null for unknown category", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("nonexistent");
    expect(cat).toBeNull();
  });

  // Brands
  it("resolves marca-qa brand", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("marca-qa");
    expect(brand).not.toBeNull();
    expect(brand!.name).toBe("Marca QA");
  });

  it("resolves wlmouse brand with zero products", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("wlmouse");
    expect(brand).not.toBeNull();
    expect(brand!.name).toBe("WLMouse");
    expect(brand!.description).toBeNull();
    expect(brand!.logo).toBeNull();

    const products = await reader.getPublishedProductsByBrand(brand!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(products.totalItems).toBe(0);
    expect(products.items).toHaveLength(0);
  });

  it("resolves pulsar brand with zero products", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("pulsar");
    expect(brand).not.toBeNull();
    expect(brand!.name).toBe("Pulsar");

    const products = await reader.getPublishedProductsByBrand(brand!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(products.totalItems).toBe(0);
  });

  it("returns null for unknown brand", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("nonexistent");
    expect(brand).toBeNull();
  });

  // The preview catalog is the real storefront inventory.
  it("lists the 7 inventory mice, most recent (listed order) first", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mouses");
    expect(cat).not.toBeNull();

    const page1 = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(page1.totalItems).toBe(7);
    expect(page1.totalPages).toBe(1);
    expect(page1.items[0]?.slug).toBe("atk-a9-plus-2-0-black");
    expect(page1.items[0]?.startingPriceCents).toBe(18900);
  });

  it("lists the 5 inventory mousepads", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mousepads");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBe(5);
  });

  it("lists the 2 skates under accesorios", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("accesorios");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.items.map((p) => p.slug)).toEqual([
      "x-raypad-jade-air",
      "x-raypad-obsidian-air-pro",
    ]);
  });

  it("categories without inventory are empty", async () => {
    const reader = new DevCatalogPreviewReader();
    for (const slug of ["teclados", "audio"]) {
      const cat = await reader.getPublishedCategoryBySlug(slug);
      const result = await reader.getPublishedProductsByCategory(cat!.id, {
        page: 1,
        pageSize: 12,
      });
      expect(result.totalItems).toBe(0);
    }
  });

  it("inventory products never expose cost_cents", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mouses");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 14,
    });

    for (const product of result.items) {
      expect("costCents" in product).toBe(false);
      expect("cost_cents" in product).toBe(false);
    }
  });

  it("resolves inventory brands with their products", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("mchose");
    expect(brand).not.toBeNull();

    const result = await reader.getPublishedProductsByBrand(brand!.id, {
      page: 1,
      pageSize: 100,
    });
    expect(result.totalItems).toBe(3);
  });

  it("resolves an inventory PDP with one variant at the listed price", async () => {
    const reader = new DevCatalogPreviewReader();
    const product = await reader.getPublishedProductBySlug("atk-a9-plus-2-0-black");
    expect(product?.name).toBe("ATK A9 Plus 2.0 Black");
    expect(product?.variants).toHaveLength(1);
    expect(product?.variants[0]?.priceCents).toBe(18900);
    expect(product?.variants[0]?.compareAtPriceCents).toBeNull();
    expect(product?.story).toBeNull();
  });
});
