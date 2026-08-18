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
import type { SearchEntityMatches, SearchPagination, SearchSuggestionsResult } from "./types";

export interface CatalogSearchReader {
  getSearchSuggestions(query: string): Promise<SearchSuggestionsResult>;
  getSearchBaseFacetOptions(
    query: string
  ): Promise<{ brands: BrandFacetOption[]; categories: CategoryFacetOption[] }>;
  getSearchDiscoveryFacets(
    query: string,
    baseBrands: BrandFacetOption[],
    baseCategories: CategoryFacetOption[],
    selectedCategoryId: string | null,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets>;
  searchProducts(
    query: string,
    pagination: SearchPagination,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;
  searchMatchingEntities(query: string): Promise<SearchEntityMatches>;
}

export { getSearchReader } from "./get-reader";
