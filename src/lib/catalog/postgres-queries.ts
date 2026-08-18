import "server-only";
import { and, countDistinct, eq, sql } from "drizzle-orm";
import { db } from "@/db";

import {
  brands,
  categories,
  categorySpecificationSchemas,
  mediaAssets,
  productSpecifications,
  products,
  productVariants,
} from "@/db/schema";
import {
  buildEligibleStartingPriceSql,
  buildEligibleVariantExistsClause,
  buildProductDiscoveryWhereClause,
  buildProductSortOrderBy,
} from "@/lib/discovery-filters/postgres-predicates";
import type {
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

/**
 * Production Drizzle Query Builders for PostgreSQL Catalog Discovery
 *
 * Exposes the exact query builder instances used by PostgresCatalogDiscoveryReader,
 * allowing unit tests to inspect query structure via `.toSQL()` without connecting to PostgreSQL.
 */

export function buildPublishedCategoryBySlugQuery(slug: string) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      parentId: categories.parentId,
      displayOrder: categories.displayOrder,
      currentSpecSchemaId: categories.currentSpecSchemaId,
    })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.status, "PUBLISHED")))
    .limit(1);
}

export function buildPublishedBrandBySlugQuery(slug: string) {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      description: brands.description,
      logoObjectKey: mediaAssets.objectKey,
      logoAltText: mediaAssets.altText,
    })
    .from(brands)
    .leftJoin(
      mediaAssets,
      and(
        eq(brands.logoMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(and(eq(brands.slug, slug), eq(brands.status, "PUBLISHED")))
    .limit(1);
}

export function buildCategorySpecificationSchemaQuery(categoryId: string) {
  return db
    .select({
      id: categorySpecificationSchemas.id,
      categoryId: categorySpecificationSchemas.categoryId,
      schemaVersion: categorySpecificationSchemas.schemaVersion,
      fieldDefinitions: categorySpecificationSchemas.fieldDefinitions,
      isActive: categorySpecificationSchemas.isActive,
    })
    .from(categorySpecificationSchemas)
    .innerJoin(
      categories,
      and(
        eq(categories.id, categoryId),
        eq(categories.currentSpecSchemaId, categorySpecificationSchemas.id),
        eq(categories.status, "PUBLISHED")
      )
    )
    .where(
      and(
        eq(categorySpecificationSchemas.categoryId, categoryId),
        eq(categorySpecificationSchemas.isActive, true)
      )
    )
    .limit(1);
}

export function buildCategoryBrandFacetOptionsQuery(categoryId: string) {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
    })
    .from(brands)
    .where(
      and(
        eq(brands.status, "PUBLISHED"),
        sql`EXISTS (
          SELECT 1
          FROM ${products}
          JOIN ${categories} ON ${categories.id} = ${products.categoryId}
          JOIN ${productVariants} ON ${productVariants.productId} = ${products.id}
          WHERE ${products.brandId} = ${brands.id}
            AND ${products.categoryId} = ${categoryId}
            AND ${products.status} = 'PUBLISHED'
            AND ${categories.status} = 'PUBLISHED'
            AND ${productVariants.status} = 'ACTIVE'
        )`
      )
    )
    .orderBy(brands.name);
}

export function buildBrandCategoryFacetOptionsQuery(brandId: string) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .where(
      and(
        eq(categories.status, "PUBLISHED"),
        sql`EXISTS (
          SELECT 1
          FROM ${products}
          JOIN ${brands} ON ${brands.id} = ${products.brandId}
          JOIN ${productVariants} ON ${productVariants.productId} = ${products.id}
          WHERE ${products.categoryId} = ${categories.id}
            AND ${products.brandId} = ${brandId}
            AND ${products.status} = 'PUBLISHED'
            AND ${brands.status} = 'PUBLISHED'
            AND ${productVariants.status} = 'ACTIVE'
        )`
      )
    )
    .orderBy(categories.name);
}

export function buildTechnicalRepresentedSpecValuesQuery(
  categoryId: string,
  schemaId: string,
  schemaVersion: number
) {
  return db
    .select({
      specValues: productSpecifications.specValues,
    })
    .from(productSpecifications)
    .innerJoin(products, eq(products.id, productSpecifications.productId))
    .innerJoin(brands, and(eq(brands.id, products.brandId), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(categories.id, products.categoryId), eq(categories.status, "PUBLISHED"))
    )
    .where(
      and(
        eq(products.categoryId, categoryId),
        eq(products.status, "PUBLISHED"),
        eq(productSpecifications.schemaId, schemaId),
        eq(productSpecifications.schemaVersion, schemaVersion),
        buildEligibleVariantExistsClause(null, null)
      )
    );
}

export function buildCategoryFilteredProductCountQuery(
  categoryId: string,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: 1,
  };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    categoryId,
    validatedSchema: schema ?? null,
  });

  return db
    .select({
      count: countDistinct(products.id),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .where(whereClause);
}

export function buildBrandFilteredProductCountQuery(
  brandId: string,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: 1,
  };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    brandId,
    validatedSchema: schema ?? null,
  });

  return db
    .select({
      count: countDistinct(products.id),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .where(whereClause);
}

export function buildCategoryFilteredProductsQuery(
  categoryId: string,
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: safePage,
  };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    categoryId,
    validatedSchema: schema ?? null,
  });

  const startingPriceSql = buildEligibleStartingPriceSql(
    state.price.minCents,
    state.price.maxCents
  );

  const orderByClauses = buildProductSortOrderBy(
    state.sort,
    "category",
    state.price.minCents,
    state.price.maxCents
  );

  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
      primaryMediaKey: mediaAssets.objectKey,
      primaryMediaAlt: mediaAssets.altText,
      primaryMediaWidth: mediaAssets.width,
      primaryMediaHeight: mediaAssets.height,
      startingPriceCents: startingPriceSql.mapWith(Number),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .leftJoin(
      mediaAssets,
      and(
        eq(products.primaryMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(whereClause)
    .orderBy(...orderByClauses)
    .limit(safePageSize)
    .offset(offset);
}

export function buildBrandFilteredProductsQuery(
  brandId: string,
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: safePage,
  };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    brandId,
    validatedSchema: schema ?? null,
  });

  const startingPriceSql = buildEligibleStartingPriceSql(
    state.price.minCents,
    state.price.maxCents
  );

  const orderByClauses = buildProductSortOrderBy(
    state.sort,
    "brand",
    state.price.minCents,
    state.price.maxCents
  );

  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
      primaryMediaKey: mediaAssets.objectKey,
      primaryMediaAlt: mediaAssets.altText,
      primaryMediaWidth: mediaAssets.width,
      primaryMediaHeight: mediaAssets.height,
      startingPriceCents: startingPriceSql.mapWith(Number),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .leftJoin(
      mediaAssets,
      and(
        eq(products.primaryMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(whereClause)
    .orderBy(...orderByClauses)
    .limit(safePageSize)
    .offset(offset);
}
