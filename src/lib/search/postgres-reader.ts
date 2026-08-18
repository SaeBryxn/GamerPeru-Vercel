import "server-only";
import {
  buildCategorySpecificationSchemaQuery,
  buildTechnicalRepresentedSpecValuesQuery,
} from "@/lib/catalog/postgres-queries";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  ProductDiscoveryItem,
  SpecificationEnumOption,
  TechnicalFacet,
  ValidatedSpecificationSchema,
} from "@/lib/catalog/types";

import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";
import { normalizeSearchQuery } from "./normalization";
import {
  buildFullMatchingBrandsQuery,
  buildFullMatchingCategoriesQuery,
  buildFullProductCountQuery,
  buildFullProductResultsQuery,
  buildPredictiveBrandsQuery,
  buildPredictiveCategoriesQuery,
  buildPredictiveProductsQuery,
  buildSearchBrandFacetOptionsQuery,
  buildSearchCategoryFacetOptionsQuery,
} from "./postgres-queries";
import type { CatalogSearchReader } from "./reader";
import {
  MIN_SEARCH_QUERY_LENGTH,
  type SearchEntityMatches,
  type SearchPagination,
  type SearchProductSuggestion,
  type SearchSuggestionsResult,
} from "./types";

function deriveTechnicalFacets(
  schema: ValidatedSpecificationSchema,
  specValueRows: Array<{ specValues: unknown }>
): TechnicalFacet[] {
  const facets: TechnicalFacet[] = [];

  for (const field of schema.fieldDefinitions) {
    if (!field.filterable) continue;

    if (field.filterKind === "ENUM_MULTI") {
      const representedValues = new Set<string>();
      for (const row of specValueRows) {
        if (row.specValues && typeof row.specValues === "object") {
          const val = (row.specValues as Record<string, unknown>)[field.key];
          if (typeof val === "string") {
            representedValues.add(val);
          }
        }
      }

      const representedOptions: SpecificationEnumOption[] = (field.options ?? []).filter((opt) =>
        representedValues.has(opt.value)
      );

      if (representedOptions.length > 0) {
        facets.push({
          field,
          kind: "ENUM_MULTI",
          representedOptions,
        });
      }
    } else if (field.filterKind === "NUMBER_RANGE") {
      let minObserved: number | null = null;
      let maxObserved: number | null = null;

      for (const row of specValueRows) {
        if (row.specValues && typeof row.specValues === "object") {
          const val = (row.specValues as Record<string, unknown>)[field.key];
          if (typeof val === "number" && Number.isFinite(val)) {
            if (minObserved === null || val < minObserved) minObserved = val;
            if (maxObserved === null || val > maxObserved) maxObserved = val;
          }
        }
      }

      if (minObserved !== null && maxObserved !== null) {
        facets.push({
          field,
          kind: "NUMBER_RANGE",
          minRepresented: minObserved,
          maxRepresented: maxObserved,
        });
      }
    } else if (field.filterKind === "BOOLEAN") {
      let hasTrue = false;
      for (const row of specValueRows) {
        if (row.specValues && typeof row.specValues === "object") {
          const val = (row.specValues as Record<string, unknown>)[field.key];
          if (val === true) {
            hasTrue = true;
            break;
          }
        }
      }

      if (hasTrue) {
        facets.push({
          field,
          kind: "BOOLEAN",
          hasRepresentedTrue: true,
        });
      }
    }
  }

  return facets;
}

/**
 * Authoritative PostgreSQL Catalog Search Reader
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

  async getSearchDiscoveryFacets(
    query: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets> {
    const cleanQuery = normalizeSearchQuery(query);
    if (cleanQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return {
        brands: [],
        categories: [],
        technicalSchema: null,
        technicalFacets: [],
      };
    }

    const [brandRows, categoryRows] = await Promise.all([
      buildSearchBrandFacetOptionsQuery(cleanQuery),
      buildSearchCategoryFacetOptionsQuery(cleanQuery),
    ]);

    if (selectedCategorySlug) {
      const cat = categoryRows.find((c) => c.slug === selectedCategorySlug);
      if (cat) {
        const schemaRows = await buildCategorySpecificationSchemaQuery(cat.id);
        const validSchema = validateSpecificationSchema(schemaRows[0] ?? null);
        if (validSchema) {
          const specRows = await buildTechnicalRepresentedSpecValuesQuery(
            cat.id,
            validSchema.id,
            validSchema.schemaVersion
          );
          const techFacets = deriveTechnicalFacets(validSchema, specRows);
          return {
            brands: brandRows,
            categories: categoryRows,
            technicalSchema: validSchema,
            technicalFacets: techFacets,
          };
        }
      }
    }

    return {
      brands: brandRows,
      categories: categoryRows,
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  async searchProducts(
    query: string,
    pagination: SearchPagination,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
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
      buildFullProductCountQuery(cleanQuery, filterState, schema),
      buildFullProductResultsQuery(cleanQuery, safePage, safePageSize, filterState, schema),
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
