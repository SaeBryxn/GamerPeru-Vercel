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
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns PostgresCatalogDiscoveryReader when no flags are set (development)", async () => {
    setNodeEnv("development");
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class MockPostgres {
        _type = "postgres";
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

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("postgres");
  });

  it("returns DevCatalogPreviewReader when DEV_CATALOG_PREVIEW=1 in development", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class MockPostgres {
        _type = "postgres";
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

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("dev-preview");
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in production", async () => {
    setNodeEnv("production");
    process.env.DEV_CATALOG_PREVIEW = "1";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/fixture-reader", () => ({
      FixtureCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-reader", () => ({
      DevCatalogPreviewReader: class {},
    }));

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/only allowed in development/);
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in test environment", async () => {
    setNodeEnv("test");
    process.env.DEV_CATALOG_PREVIEW = "1";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/fixture-reader", () => ({
      FixtureCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-reader", () => ({
      DevCatalogPreviewReader: class {},
    }));

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/only allowed in development/);
  });

  it("throws when DEV_CATALOG_PREVIEW=1 in CI", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "1";
    process.env.CI = "true";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/fixture-reader", () => ({
      FixtureCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-reader", () => ({
      DevCatalogPreviewReader: class {},
    }));

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/NEVER be enabled in CI/);
  });

  it("returns FixtureCatalogDiscoveryReader when E2E_CATALOG_FIXTURES=1 + PLAYWRIGHT_TEST=1", async () => {
    setNodeEnv("test");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class MockPostgres {
        _type = "postgres";
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

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("fixture");
  });

  it("throws when both E2E_CATALOG_FIXTURES and DEV_CATALOG_PREVIEW are set", async () => {
    setNodeEnv("development");
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.DEV_CATALOG_PREVIEW = "1";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/fixture-reader", () => ({
      FixtureCatalogDiscoveryReader: class {},
    }));
    vi.doMock("../../src/lib/catalog/dev-preview-reader", () => ({
      DevCatalogPreviewReader: class {},
    }));

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    expect(() => getCatalogReader()).toThrow(/Ambiguous catalog reader configuration/);
  });

  it("returns PostgresCatalogDiscoveryReader when DEV_CATALOG_PREVIEW=0 in development", async () => {
    setNodeEnv("development");
    process.env.DEV_CATALOG_PREVIEW = "0";
    vi.doMock("../../src/lib/catalog/postgres-reader", () => ({
      PostgresCatalogDiscoveryReader: class MockPostgres {
        _type = "postgres";
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

    const { getCatalogReader } = await import("../../src/lib/catalog/get-reader");
    const reader = getCatalogReader();
    expect((reader as unknown as { _type: string })._type).toBe("postgres");
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

  // Mouses pagination: 14 products -> page 1 = 12, page 2 = 2
  it("paginates mouses category: page 1 = 12, page 2 = 2", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mouses");
    expect(cat).not.toBeNull();

    const page1 = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(page1.items).toHaveLength(12);
    expect(page1.totalItems).toBe(14);
    expect(page1.totalPages).toBe(2);

    const page2 = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 2,
      pageSize: 12,
    });
    expect(page2.items).toHaveLength(2);
  });

  // Other categories have 4 products each
  it("teclados has at least 4 products", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("teclados");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBeGreaterThanOrEqual(4);
  });

  it("mousepads has at least 4 products", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mousepads");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBeGreaterThanOrEqual(4);
  });

  it("audio has at least 4 products", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("audio");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBeGreaterThanOrEqual(4);
  });

  it("accesorios has at least 4 products", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("accesorios");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBeGreaterThanOrEqual(4);
  });

  // Synthetic products never expose cost_cents or private media
  it("synthetic products never expose cost_cents or private media", async () => {
    const reader = new DevCatalogPreviewReader();
    const cat = await reader.getPublishedCategoryBySlug("mouses");
    const result = await reader.getPublishedProductsByCategory(cat!.id, {
      page: 1,
      pageSize: 14,
    });

    for (const product of result.items) {
      expect(product.primaryMedia).toBeNull();
      expect("costCents" in product).toBe(false);
      expect("cost_cents" in product).toBe(false);
      expect(product.brand.name).toBe("Marca QA");
    }
  });

  // marca-qa brand should resolve all synthetic products
  it("marca-qa brand resolves with all synthetic products", async () => {
    const reader = new DevCatalogPreviewReader();
    const brand = await reader.getPublishedBrandBySlug("marca-qa");
    expect(brand).not.toBeNull();

    const result = await reader.getPublishedProductsByBrand(brand!.id, {
      page: 1,
      pageSize: 100,
    });
    // 14 (mouses) + 4*4 (teclados, mousepads, audio, accesorios) = 30
    expect(result.totalItems).toBe(30);
  });
});
