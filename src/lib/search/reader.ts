import "server-only";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
} from "@/lib/catalog/types";
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

/**
 * Server-only Catalog Search Reader Interface
 *
 * Dedicated search boundary independent of CatalogDiscoveryReader.
 * Provides predictive suggestions, full paginated product search, and matching entities.
 *
 * Security & Data Invariants:
 * 1. Requires PUBLISHED status on products, brands, and categories.
 * 2. Requires at least one ACTIVE product_variant matching eligible price filters.
 * 3. Starting price is computed strictly from EligibleVariants.
 * 4. Only PUBLIC_MEDIA images are projected.
 * 5. cost_cents, supplier data, private media, and internal fields are NEVER selected.
 * 6. Predictive suggestions do NOT perform a full product count (PREDICTIVE TOTAL COUNT: NOT PERFORMED).
 */
export interface CatalogSearchReader {
  /**
   * Returns bounded suggestions for predictive search drawer (up to 6 products, 3 brands, 3 categories).
   * Does NOT perform total count.
   */
  getSearchSuggestions(query: string): Promise<SearchSuggestionsResult>;

  /**
   * Retrieves discovery facets for search results (brand options, category options, conditional technical schema).
   */
  getSearchDiscoveryFacets(
    query: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets>;

  /**
   * Performs full paginated product search for /buscar results page matching filter state and sort.
   */
  searchProducts(
    query: string,
    pagination: SearchPagination,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;

  /**
   * Returns matching Brand and Category entities for /buscar results page (bounded up to 4 each).
   */
  searchMatchingEntities(query: string): Promise<SearchEntityMatches>;
}
