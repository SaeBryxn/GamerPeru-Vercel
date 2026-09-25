import "server-only";
import { buildCardGallery } from "./card-gallery";
import { buildProductCardSpecs } from "./card-specs";
import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";
import type {
  CategoryFacetOption,
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

export function deriveTechnicalFacets(
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

type ProductRow = Awaited<ReturnType<typeof buildCategoryFilteredProductsQuery>>[number];

function toDiscoveryItem(row: ProductRow): ProductDiscoveryItem {
  const primaryMedia = row.primaryMediaKey
    ? {
        objectKey: row.primaryMediaKey,
        altText: row.primaryMediaAlt,
        width: row.primaryMediaWidth,
        height: row.primaryMediaHeight,
      }
    : null;

  return {
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
    primaryMedia,
    startingPriceCents: row.startingPriceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    gallery: buildCardGallery(primaryMedia, row.gallery),
    singleVariantId: row.singleVariantId,
    specs: buildProductCardSpecs(row.specValues, row.specFieldDefinitions),
  };
}

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
        buildTechnicalRepresentedSpecValuesQuery(categoryId),
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

  async getBrandCategoryFacetOptions(brandId: string): Promise<CategoryFacetOption[]> {
    return buildBrandCategoryFacetOptionsQuery(brandId);
  }

  async getBrandDiscoveryFacets(
    brandId: string,
    baseCategories: CategoryFacetOption[],
    selectedCategoryId: string | null,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    if (selectedCategoryId && schema) {
      const specRows = await buildTechnicalRepresentedSpecValuesQuery(selectedCategoryId, brandId);
      const techFacets = deriveTechnicalFacets(schema, specRows);
      return {
        brands: [],
        categories: baseCategories,
        technicalSchema: schema,
        technicalFacets: techFacets,
      };
    }

    return {
      brands: [],
      categories: baseCategories,
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
    const safePage = Math.max(1, Math.trunc(pagination.page));
    const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));

    const [countRows, productRows] = await Promise.all([
      buildCategoryFilteredProductCountQuery(categoryId, filterState, schema),
      buildCategoryFilteredProductsQuery(categoryId, safePage, safePageSize, filterState, schema),
    ]);

    const totalItems = countRows[0]?.count ?? 0;
    const totalPages = Math.ceil(totalItems / safePageSize);

    const items = productRows.map(toDiscoveryItem);

    return {
      items,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const safePage = Math.max(1, Math.trunc(pagination.page));
    const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));

    const [countRows, productRows] = await Promise.all([
      buildBrandFilteredProductCountQuery(brandId, filterState, schema),
      buildBrandFilteredProductsQuery(brandId, safePage, safePageSize, filterState, schema),
    ]);

    const totalItems = countRows[0]?.count ?? 0;
    const totalPages = Math.ceil(totalItems / safePageSize);

    const items = productRows.map(toDiscoveryItem);

    return {
      items,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }
}

export { getCachedBrand, getCachedCategory } from "./cached-queries";
