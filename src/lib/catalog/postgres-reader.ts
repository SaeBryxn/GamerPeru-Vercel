import "server-only";
import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  SpecificationEnumOption,
  TechnicalFacet,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

import {
  buildBrandCategoryFacetOptionsQuery,
  buildBrandFilteredProductCountQuery,
  buildBrandFilteredProductsQuery,
  buildCategoryBrandFacetOptionsQuery,
  buildCategoryFilteredProductCountQuery,
  buildCategoryFilteredProductsQuery,
  buildCategorySpecificationSchemaQuery,
  buildPublishedBrandBySlugQuery,
  buildPublishedCategoryBySlugQuery,
  buildTechnicalRepresentedSpecValuesQuery,
} from "./postgres-queries";
import type { CatalogDiscoveryReader } from "./reader";
import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";

/**
 * Derives TechnicalFacet[] by intersecting validated schema field definitions
 * with actual represented data in public ProductSpecifications rows.
 */
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

      // Preserve schema definition order, but include only represented options
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
 * PostgreSQL Production Catalog Discovery Reader
 */
export class PostgresCatalogDiscoveryReader implements CatalogDiscoveryReader {
  async getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null> {
    const rows = await buildPublishedCategoryBySlugQuery(slug);
    return rows[0] ?? null;
  }

  async getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null> {
    const rows = await buildPublishedBrandBySlugQuery(slug);
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      logo: row.logoObjectKey
        ? {
            objectKey: row.logoObjectKey,
            altText: row.logoAltText,
          }
        : null,
    };
  }

  async getCategorySpecificationSchema(
    categoryId: string
  ): Promise<ValidatedSpecificationSchema | null> {
    const rows = await buildCategorySpecificationSchemaQuery(categoryId);
    const row = rows[0];
    if (!row) return null;

    return validateSpecificationSchema(row);
  }

  async getCategoryDiscoveryFacets(
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    const brandRowsPromise = buildCategoryBrandFacetOptionsQuery(categoryId);

    let techFacets: TechnicalFacet[] = [];
    if (schema) {
      const [brandRows, specRows] = await Promise.all([
        brandRowsPromise,
        buildTechnicalRepresentedSpecValuesQuery(categoryId, schema.id, schema.schemaVersion),
      ]);
      techFacets = deriveTechnicalFacets(schema, specRows);
      return {
        brands: brandRows,
        categories: [],
        technicalSchema: schema,
        technicalFacets: techFacets,
      };
    }

    const brandRows = await brandRowsPromise;
    return {
      brands: brandRows,
      categories: [],
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  async getBrandDiscoveryFacets(
    brandId: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets> {
    const categoryRows = await buildBrandCategoryFacetOptionsQuery(brandId);

    if (selectedCategorySlug) {
      const cat = categoryRows.find((c) => c.slug === selectedCategorySlug);
      if (cat) {
        const schema = await this.getCategorySpecificationSchema(cat.id);
        if (schema) {
          const specRows = await buildTechnicalRepresentedSpecValuesQuery(
            cat.id,
            schema.id,
            schema.schemaVersion
          );
          const techFacets = deriveTechnicalFacets(schema, specRows);
          return {
            brands: [],
            categories: categoryRows,
            technicalSchema: schema,
            technicalFacets: techFacets,
          };
        }
      }
    }

    return {
      brands: [],
      categories: categoryRows,
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const page = Math.max(1, Math.trunc(pagination.page));
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));

    const [countResult, rows] = await Promise.all([
      buildCategoryFilteredProductCountQuery(categoryId, filterState, schema),
      buildCategoryFilteredProductsQuery(categoryId, page, pageSize, filterState, schema),
    ]);

    const totalItems = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalItems / pageSize);

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
      startingPriceCents: row.startingPriceCents ?? 0,
    }));

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };
  }

  async getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const page = Math.max(1, Math.trunc(pagination.page));
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));

    const [countResult, rows] = await Promise.all([
      buildBrandFilteredProductCountQuery(brandId, filterState, schema),
      buildBrandFilteredProductsQuery(brandId, page, pageSize, filterState, schema),
    ]);

    const totalItems = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalItems / pageSize);

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
      startingPriceCents: row.startingPriceCents ?? 0,
    }));

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };
  }
}
