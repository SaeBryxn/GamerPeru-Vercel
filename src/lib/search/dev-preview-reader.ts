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
 * Development-Only Catalog Search Preview Reader
 *
 * Provides synthetic preview search responses when DEV_CATALOG_PREVIEW=1.
 * NEVER connects to or mutates PostgreSQL.
 */
export class DevCatalogSearchReader implements CatalogSearchReader {
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
