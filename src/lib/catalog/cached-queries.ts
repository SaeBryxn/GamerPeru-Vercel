import "server-only";
import { cache } from "react";
import {
  getCatalogReader,
  getProductDetailReader,
  getStoryRelatedProductsReader,
} from "./get-reader";
import { resolveCatalogReaderMode } from "./resolve-reader-mode";
import { logger } from "@/lib/logger";
import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  CategoryFacetOption,
  DiscoveryFacets,
  ProductDetailEntity,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
} from "./types";

/**
 * Request-Scoped Cached Catalog Queries
 *
 * Uses React cache() for request-level deduplication between generateMetadata()
 * and page component rendering within a single HTTP request cycle.
 *
 * Invariant:
 * Does NOT introduce cross-request business caching.
 */
export const getCachedCategory = cache(
  async (slug: string): Promise<CategoryDiscoveryEntity | null> => {
    const reader = getCatalogReader();
    return reader.getPublishedCategoryBySlug(slug);
  }
);

export const getCachedBrand = cache(async (slug: string): Promise<BrandDiscoveryEntity | null> => {
  const reader = getCatalogReader();
  return reader.getPublishedBrandBySlug(slug);
});

export const getCachedCategorySchema = cache(
  async (categoryId: string): Promise<ValidatedSpecificationSchema | null> => {
    const reader = getCatalogReader();
    return reader.getCategorySpecificationSchema(categoryId);
  }
);

export const getCachedCategoryDiscoveryFacets = cache(
  async (
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> => {
    const reader = getCatalogReader();
    return reader.getCategoryDiscoveryFacets(categoryId, schema);
  }
);

export const getCachedBrandCategoryFacetOptions = cache(
  async (brandId: string): Promise<CategoryFacetOption[]> => {
    const reader = getCatalogReader();
    return reader.getBrandCategoryFacetOptions(brandId);
  }
);

export const getCachedProduct = cache(async (slug: string): Promise<ProductDetailEntity | null> => {
  const reader = getProductDetailReader();
  return reader.getPublishedProductBySlug(slug);
});

export const getCachedStoryRelatedProducts = cache(
  async (slugs: readonly string[], excludeProductId?: string): Promise<ProductDiscoveryItem[]> => {
    if (!slugs || slugs.length === 0) {
      return [];
    }

    try {
      const reader = getStoryRelatedProductsReader();
      return await reader.getPublishedProductsBySlugs(slugs, excludeProductId);
    } catch {
      logger.warn({
        event: "pdp_story_related_products_hydration_failed",
        currentProductId: excludeProductId ?? null,
        requestedUniqueSlugCount: slugs.length,
        readerMode: resolveCatalogReaderMode(),
      });
      return [];
    }
  }
);
