import "server-only";
import type { PaginatedResult, ProductDiscoveryItem } from "@/lib/catalog/types";
import { normalizeSearchQuery } from "./normalization";
import {
  buildFullMatchingBrandsQuery,
  buildFullMatchingCategoriesQuery,
  buildFullProductCountQuery,
  buildFullProductResultsQuery,
  buildPredictiveBrandsQuery,
  buildPredictiveCategoriesQuery,
  buildPredictiveProductsQuery,
} from "./postgres-queries";
import type { CatalogSearchReader } from "./reader";
import {
  MIN_SEARCH_QUERY_LENGTH,
  type SearchEntityMatches,
  type SearchPagination,
  type SearchProductSuggestion,
  type SearchSuggestionsResult,
} from "./types";

/**
 * Authoritative PostgreSQL Catalog Search Reader
 *
 * Implements deterministic PostgreSQL search using canonical query builders.
 * Utilizes GIN trigram indexes and B-tree slug indexes created in GP-012 DB1/DB2.
 */
export class PostgresCatalogSearchReader implements CatalogSearchReader {
  async getSearchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    const cleanQuery = normalizeSearchQuery(query);
    if (cleanQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return { products: [], brands: [], categories: [] };
    }

    const [rawProducts, brands, categories] = await Promise.all([
      buildPredictiveProductsQuery(cleanQuery, 6),
      buildPredictiveBrandsQuery(cleanQuery, 3),
      buildPredictiveCategoriesQuery(cleanQuery, 3),
    ]);

    const products: SearchProductSuggestion[] = rawProducts.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: row.subtitle,
      brand: {
        name: row.brandName,
        slug: row.brandSlug,
      },
      startingPriceCents: row.startingPriceCents,
      primaryMedia: row.primaryMediaKey
        ? {
            objectKey: row.primaryMediaKey,
            altText: row.primaryMediaAlt,
            width: row.primaryMediaWidth,
            height: row.primaryMediaHeight,
          }
        : null,
    }));

    return {
      products,
      brands,
      categories,
    };
  }

  async searchProducts(
    query: string,
    pagination: SearchPagination
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const cleanQuery = normalizeSearchQuery(query);
    const safePage = Math.max(1, Math.trunc(pagination.page));
    const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));

    if (cleanQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return {
        items: [],
        totalItems: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 0,
      };
    }

    const [countResult, rows] = await Promise.all([
      buildFullProductCountQuery(cleanQuery),
      buildFullProductResultsQuery(cleanQuery, safePage, safePageSize),
    ]);

    const totalItems = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(totalItems / safePageSize);

    const items: ProductDiscoveryItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: row.subtitle,
      brand: {
        name: row.brandName,
        slug: row.brandSlug,
      },
      category: {
        name: row.categoryName,
        slug: row.categorySlug,
      },
      primaryMedia: row.primaryMediaKey
        ? {
            objectKey: row.primaryMediaKey,
            altText: row.primaryMediaAlt,
            width: row.primaryMediaWidth,
            height: row.primaryMediaHeight,
          }
        : null,
      startingPriceCents: row.startingPriceCents,
    }));

    return {
      items,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async searchMatchingEntities(query: string): Promise<SearchEntityMatches> {
    const cleanQuery = normalizeSearchQuery(query);
    if (cleanQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return { brands: [], categories: [] };
    }

    const [brands, categories] = await Promise.all([
      buildFullMatchingBrandsQuery(cleanQuery, 4),
      buildFullMatchingCategoriesQuery(cleanQuery, 4),
    ]);

    return {
      brands,
      categories,
    };
  }
}
