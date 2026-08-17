import type { PaginatedResult, ProductDiscoveryItem } from "@/lib/catalog/types";

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_SEARCH_QUERY_LENGTH = 100;
export const DEFAULT_SEARCH_PAGE_SIZE = 12;

export interface SearchPagination {
  page: number;
  pageSize: number;
}

export interface SearchBrandSuggestion {
  name: string;
  slug: string;
}

export interface SearchCategorySuggestion {
  name: string;
  slug: string;
}

export interface SearchProductSuggestion {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  brand: {
    name: string;
    slug: string;
  };
  startingPriceCents: number;
  primaryMedia: {
    objectKey: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
}

export interface SearchSuggestionsResult {
  products: SearchProductSuggestion[];
  brands: SearchBrandSuggestion[];
  categories: SearchCategorySuggestion[];
}

export interface SearchEntityMatches {
  brands: SearchBrandSuggestion[];
  categories: SearchCategorySuggestion[];
}

export interface FullSearchResults {
  query: string;
  products: PaginatedResult<ProductDiscoveryItem>;
  entityMatches: SearchEntityMatches;
}
