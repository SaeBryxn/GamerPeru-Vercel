import "server-only";
import { cache } from "react";
import { getCatalogReader } from "./get-reader";
import type { BrandDiscoveryEntity, CategoryDiscoveryEntity } from "./types";

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
