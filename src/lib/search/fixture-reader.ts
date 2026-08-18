import "server-only";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
} from "@/lib/catalog/types";
import type { CatalogSearchReader } from "./reader";
import {
  getSyntheticSearchDiscoveryFacets,
  getSyntheticSuggestions,
  searchSyntheticMatchingEntities,
  searchSyntheticProducts,
} from "./synthetic-search-engine";
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

/**
 * Playwright E2E Fixture Search Reader
 */
export class FixtureCatalogSearchReader implements CatalogSearchReader {
  async getSearchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    return getSyntheticSuggestions(query);
  }

  async getSearchDiscoveryFacets(
    query: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets> {
    return getSyntheticSearchDiscoveryFacets(query, selectedCategorySlug);
  }

  async searchProducts(
    query: string,
    pagination: SearchPagination,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    return searchSyntheticProducts(query, pagination, filterState, schema);
  }

  async searchMatchingEntities(query: string): Promise<SearchEntityMatches> {
    return searchSyntheticMatchingEntities(query);
  }
}
