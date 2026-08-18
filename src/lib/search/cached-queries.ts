import "server-only";
import { cache } from "react";
import type { BrandFacetOption, CategoryFacetOption } from "@/lib/catalog/types";
import { getSearchReader } from "./get-reader";
import type { SearchEntityMatches } from "./types";

/**
 * Request-Scoped Cached Search Queries
 *
 * Uses React cache() for request-level deduplication between generateMetadata()
 * and page component rendering within a single HTTP request cycle.
 */
export const getCachedSearchBaseFacetOptions = cache(
  async (
    cleanQuery: string
  ): Promise<{ brands: BrandFacetOption[]; categories: CategoryFacetOption[] }> => {
    const reader = getSearchReader();
    return reader.getSearchBaseFacetOptions(cleanQuery);
  }
);

export const getCachedSearchMatchingEntities = cache(
  async (cleanQuery: string): Promise<SearchEntityMatches> => {
    const reader = getSearchReader();
    return reader.searchMatchingEntities(cleanQuery);
  }
);
