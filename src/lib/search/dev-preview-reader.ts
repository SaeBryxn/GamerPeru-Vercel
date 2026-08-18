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
import type { CatalogSearchReader } from "./reader";
import {
  getSyntheticSearchBaseFacetOptions,
  getSyntheticSearchDiscoveryFacets,
  getSyntheticSuggestions,
  searchSyntheticMatchingEntities,
  searchSyntheticProducts,
} from "./synthetic-search-engine";
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

export class DevCatalogSearchReader implements CatalogSearchReader {
  async getSearchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    return getSyntheticSuggestions(query);
  }

  async getSearchBaseFacetOptions(
    query: string
  ): Promise<{ brands: BrandFacetOption[]; categories: CategoryFacetOption[] }> {
    return getSyntheticSearchBaseFacetOptions(query);
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
      schema
    );
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
