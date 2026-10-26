import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogDiscoveryReader } from "@/lib/catalog/reader";
import { DEFAULT_POOL_MAX, resolvePoolMax, usesSupabaseSessionPooler } from "@/db/pool-config";

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}));

function fakeReader(): CatalogDiscoveryReader {
  return {
    getPublishedCategoryBySlug: vi.fn(async (slug: string) => ({ id: `cat-${slug}` })),
    getPublishedBrandBySlug: vi.fn(async () => null),
    getCategorySpecificationSchema: vi.fn(async () => null),
    getCategoryDiscoveryFacets: vi.fn(async () => ({ brands: [] })),
    getBrandCategoryFacetOptions: vi.fn(async () => []),
    getBrandDiscoveryFacets: vi.fn(async () => ({ brands: [] })),
    getPublishedProductsByCategory: vi.fn(async () => ({ items: [], totalItems: 0 })),
    getShowcaseProducts: vi.fn(async () => []),
    getPublishedProductsByBrand: vi.fn(async () => ({ items: [], totalItems: 0 })),
    getCatalogFacetOptions: vi.fn(async () => ({ brands: [], categories: [] })),
    getPublishedProducts: vi.fn(async () => ({ items: [], totalItems: 0 })),
  } as unknown as CatalogDiscoveryReader;
}

describe("storefront catalog cache", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.unstableCache.mockReset();
    // Mirrors unstable_cache's contract closely enough to observe key parts and options.
    mocks.unstableCache.mockImplementation((fn: (...args: unknown[]) => unknown) => fn);
    mocks.revalidateTag.mockReset();
    mocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("queries the database directly outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { cacheCatalogQuery } = await import("@/lib/catalog/catalog-cache");
    const query = async () => ["row"];

    expect(cacheCatalogQuery("rows", query)).toBe(query);
    expect(mocks.unstableCache).not.toHaveBeenCalled();
  });

  it("caches across requests in production under the catalog tag and window", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { cacheCatalogQuery, CATALOG_CACHE_TAG, CATALOG_REVALIDATE_SECONDS } =
      await import("@/lib/catalog/catalog-cache");

    cacheCatalogQuery("rows", async () => ["row"]);

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["storefront-catalog", "rows"],
      { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS }
    );
  });

  it("marks the catalog stale instead of expiring the storefront at once", async () => {
    const { revalidateStorefrontCatalog, CATALOG_CACHE_TAG } =
      await import("@/lib/catalog/catalog-cache");

    revalidateStorefrontCatalog();

    expect(mocks.revalidateTag).toHaveBeenCalledWith(CATALOG_CACHE_TAG, "max");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the original reader outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { withCatalogCache } = await import("@/lib/catalog/cached-readers");
    const reader = fakeReader();

    expect(withCatalogCache(reader)).toBe(reader);
  });

  it("gives every reader method its own cache key and still delegates to the reader", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { withCatalogCache } = await import("@/lib/catalog/cached-readers");
    const reader = fakeReader();

    const cached = withCatalogCache(reader);
    const keys = mocks.unstableCache.mock.calls.map(([, keyParts]) => (keyParts as string[])[1]);

    expect(new Set(keys).size).toBe(Object.keys(reader).length);
    await expect(cached.getPublishedCategoryBySlug("mouses")).resolves.toEqual({
      id: "cat-mouses",
    });
    expect(reader.getPublishedCategoryBySlug).toHaveBeenCalledWith("mouses");
  });
});

describe("database pool configuration", () => {
  it("defaults to a small per-instance pool", () => {
    expect(DEFAULT_POOL_MAX).toBe(3);
    expect(resolvePoolMax(undefined)).toBe(3);
    expect(resolvePoolMax("")).toBe(3);
  });

  it("accepts a positive integer override and ignores invalid ones", () => {
    expect(resolvePoolMax("5")).toBe(5);
    expect(resolvePoolMax("0")).toBe(3);
    expect(resolvePoolMax("-2")).toBe(3);
    expect(resolvePoolMax("2.5")).toBe(3);
    expect(resolvePoolMax("many")).toBe(3);
  });

  it("recognises the Supabase session pooler but not the transaction pooler", () => {
    const pooler = "postgresql://postgres.ref:pw@aws-0-sa-east-1.pooler.supabase.com";
    expect(usesSupabaseSessionPooler(`${pooler}:5432/postgres`)).toBe(true);
    expect(usesSupabaseSessionPooler(`${pooler}:6543/postgres`)).toBe(false);
    expect(
      usesSupabaseSessionPooler("postgres://postgres:pw@db.ref.supabase.co:5432/postgres")
    ).toBe(false);
    expect(usesSupabaseSessionPooler("not a url")).toBe(false);
  });
});
