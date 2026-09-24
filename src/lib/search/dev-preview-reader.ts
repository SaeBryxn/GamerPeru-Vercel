import "server-only";
import type {
  BrandFacetOption,
  CategoryFacetOption,
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
} from "@/lib/catalog/types";
import {
  INVENTORY_BRAND_ENTRIES,
  getInventoryPreviewProducts,
} from "@/lib/catalog/preview-inventory";
import { SYNTHETIC_NAV_BRANDS } from "@/lib/catalog/synthetic-catalog-data";
import type { CatalogSearchReader } from "./reader";
import {
  getSyntheticSearchBaseFacetOptions,
  getSyntheticSearchDiscoveryFacets,
  getSyntheticSuggestions,
  searchSyntheticMatchingEntities,
  searchSyntheticProducts,
  type SyntheticSearchSource,
} from "./synthetic-search-engine";
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

// The local preview searches the real storefront inventory.
const PREVIEW_SEARCH_SOURCE: SyntheticSearchSource = {
  products: getInventoryPreviewProducts,
  brands: () => ({ ...SYNTHETIC_NAV_BRANDS, ...INVENTORY_BRAND_ENTRIES }),
};

export class DevCatalogSearchReader implements CatalogSearchReader {
  async getSearchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    return getSyntheticSuggestions(query, PREVIEW_SEARCH_SOURCE);
  }

  async getSearchBaseFacetOptions(
    query: string
  ): Promise<{ brands: BrandFacetOption[]; categories: CategoryFacetOption[] }> {
    return getSyntheticSearchBaseFacetOptions(query, PREVIEW_SEARCH_SOURCE);
  }

  async getSearchDiscoveryFacets(
    query: string,
    baseBrands: BrandFacetOption[],
    baseCategories: CategoryFacetOption[],
    selectedCategoryId: string | null,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    return getSyntheticSearchDiscoveryFacets(
      query,
      baseBrands,
      baseCategories,
      selectedCategoryId,
      schema,
      PREVIEW_SEARCH_SOURCE
    );
  }

  async searchProducts(
    query: string,
    pagination: SearchPagination,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    return searchSyntheticProducts(query, pagination, filterState, schema, PREVIEW_SEARCH_SOURCE);
  }

  async searchMatchingEntities(query: string): Promise<SearchEntityMatches> {
    return searchSyntheticMatchingEntities(query, PREVIEW_SEARCH_SOURCE);
  }
}
