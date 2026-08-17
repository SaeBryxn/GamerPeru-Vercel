import "server-only";
import type { PaginatedResult, ProductDiscoveryItem } from "@/lib/catalog/types";
import type { CatalogSearchReader } from "./reader";
import {
  getSyntheticSuggestions,
  searchSyntheticMatchingEntities,
  searchSyntheticProducts,
} from "./synthetic-search-engine";
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

/**
 * Playwright E2E Fixture Search Reader
 *
 * Provides deterministic search fixture responses for automated Playwright tests.
 * Active strictly when E2E_CATALOG_FIXTURES=1 and PLAYWRIGHT_TEST=1 in non-production.
 */
export class FixtureCatalogSearchReader implements CatalogSearchReader {
  async getSearchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    return getSyntheticSuggestions(query);
  }

  async searchProducts(
    query: string,
    pagination: SearchPagination
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    return searchSyntheticProducts(query, pagination);
  }

  async searchMatchingEntities(query: string): Promise<SearchEntityMatches> {
    return searchSyntheticMatchingEntities(query);
  }
}
