import "server-only";
import { cacheCatalogQuery, isCatalogCacheEnabled } from "./catalog-cache";
import type { ProductDetailReader } from "./product-detail-reader";
import type { CatalogDiscoveryReader } from "./reader";
import type { StoryRelatedProductsReader } from "./story-related-products-reader";

/**
 * Public catalog readers backed by the cross-request data cache. The wrapped readers query the
 * database and throw on failure, so a failed read is retried on the next request instead of being
 * cached; callers keep their own fail-soft handling outside the cache.
 */
export function withCatalogCache(reader: CatalogDiscoveryReader): CatalogDiscoveryReader {
  if (!isCatalogCacheEnabled()) return reader;
  return {
    getPublishedCategoryBySlug: cacheCatalogQuery("category-by-slug", (slug: string) =>
      reader.getPublishedCategoryBySlug(slug)
    ),
    getPublishedBrandBySlug: cacheCatalogQuery("brand-by-slug", (slug: string) =>
      reader.getPublishedBrandBySlug(slug)
    ),
    getCategorySpecificationSchema: cacheCatalogQuery("category-schema", (categoryId: string) =>
      reader.getCategorySpecificationSchema(categoryId)
    ),
    getCategoryDiscoveryFacets: cacheCatalogQuery(
      "category-facets",
      (...args: Parameters<CatalogDiscoveryReader["getCategoryDiscoveryFacets"]>) =>
        reader.getCategoryDiscoveryFacets(...args)
    ),
    getBrandCategoryFacetOptions: cacheCatalogQuery("brand-category-options", (brandId: string) =>
      reader.getBrandCategoryFacetOptions(brandId)
    ),
    getBrandDiscoveryFacets: cacheCatalogQuery(
      "brand-facets",
      (...args: Parameters<CatalogDiscoveryReader["getBrandDiscoveryFacets"]>) =>
        reader.getBrandDiscoveryFacets(...args)
    ),
    getPublishedProductsByCategory: cacheCatalogQuery(
      "products-by-category",
      (...args: Parameters<CatalogDiscoveryReader["getPublishedProductsByCategory"]>) =>
        reader.getPublishedProductsByCategory(...args)
    ),
    getShowcaseProducts: cacheCatalogQuery("showcase-products", (limit: number) =>
      reader.getShowcaseProducts(limit)
    ),
    getPublishedProductsByBrand: cacheCatalogQuery(
      "products-by-brand",
      (...args: Parameters<CatalogDiscoveryReader["getPublishedProductsByBrand"]>) =>
        reader.getPublishedProductsByBrand(...args)
    ),
    getShowcaseBrands: cacheCatalogQuery("showcase-brands", () => reader.getShowcaseBrands()),
    getCatalogFacetOptions: cacheCatalogQuery("catalog-facet-options", () =>
      reader.getCatalogFacetOptions()
    ),
    getPublishedProducts: cacheCatalogQuery(
      "products-all",
      (...args: Parameters<CatalogDiscoveryReader["getPublishedProducts"]>) =>
        reader.getPublishedProducts(...args)
    ),
  };
}

export function withProductDetailCache(reader: ProductDetailReader): ProductDetailReader {
  if (!isCatalogCacheEnabled()) return reader;
  return {
    getPublishedProductBySlug: cacheCatalogQuery("product-by-slug", (slug: string) =>
      reader.getPublishedProductBySlug(slug)
    ),
  };
}

export function withStoryRelatedProductsCache(
  reader: StoryRelatedProductsReader
): StoryRelatedProductsReader {
  if (!isCatalogCacheEnabled()) return reader;
  return {
    getPublishedProductsBySlugs: cacheCatalogQuery(
      "story-related-products",
      (slugs: readonly string[], excludeProductId?: string) =>
        reader.getPublishedProductsBySlugs(slugs, excludeProductId)
    ),
  };
}
