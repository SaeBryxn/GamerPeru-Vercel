import "server-only";
import { and, countDistinct, desc, eq, min, or, sql } from "drizzle-orm";
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
import { escapeLikePattern } from "./normalization";

export function buildSearchCandidateWhereClause(cleanQuery: string) {
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const containsLike = `%${escaped}%`;

  return or(
    sql`${products.name} ILIKE ${containsLike} ESCAPE '\\'`,
    sql`${products.subtitle} ILIKE ${containsLike} ESCAPE '\\'`,
    eq(products.slug, cleanSlug),
    sql`${brands.name} ILIKE ${containsLike} ESCAPE '\\'`,
    eq(brands.slug, cleanSlug),
    sql`${categories.name} ILIKE ${containsLike} ESCAPE '\\'`,
    eq(categories.slug, cleanSlug)
  );
}

export function buildRelevanceScoreExpression(cleanQuery: string) {
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const exactLike = escaped;
  const prefixLike = `${escaped}%`;

  return sql<number>`CASE
    WHEN ${products.name} ILIKE ${exactLike} ESCAPE '\\' THEN 100
    WHEN ${products.slug} = ${cleanSlug} THEN 95
    WHEN ${products.name} ILIKE ${prefixLike} ESCAPE '\\' THEN 85
    WHEN ${brands.name} ILIKE ${exactLike} ESCAPE '\\' THEN 75
    WHEN ${brands.slug} = ${cleanSlug} THEN 70
    WHEN ${categories.name} ILIKE ${exactLike} ESCAPE '\\' THEN 65
    WHEN ${categories.slug} = ${cleanSlug} THEN 60
    ELSE 40
  END`;
}

export function buildPredictiveProductsQuery(cleanQuery: string, limit = 6) {
  const safeLimit = Math.max(1, Math.min(6, Math.trunc(limit)));
  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);
  const relevance = buildRelevanceScoreExpression(cleanQuery);

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
      startingPriceCents: min(productVariants.priceCents).mapWith(Number),
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .innerJoin(
      productVariants,
      and(eq(products.id, productVariants.productId), eq(productVariants.status, "ACTIVE"))
    )
    .leftJoin(
      mediaAssets,
      and(
        eq(products.primaryMediaId, mediaAssets.id),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(and(eq(products.status, "PUBLISHED"), candidateWhere))
    .groupBy(
      products.id,
      products.name,
      products.slug,
      products.subtitle,
      products.createdAt,
      brands.name,
      brands.slug,
      categories.name,
      categories.slug,
      mediaAssets.objectKey,
      mediaAssets.altText,
      mediaAssets.width,
      mediaAssets.height
    )
    .orderBy(desc(relevance), desc(products.createdAt), desc(products.id))
    .limit(safeLimit);
}

export function buildPredictiveBrandsQuery(cleanQuery: string, limit = 3) {
  const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const exactLike = escaped;
  const prefixLike = `${escaped}%`;
  const containsLike = `%${escaped}%`;

  return db
    .select({
      name: brands.name,
      slug: brands.slug,
    })
    .from(brands)
    .where(
      and(
        eq(brands.status, "PUBLISHED"),
        or(sql`${brands.name} ILIKE ${containsLike} ESCAPE '\\'`, eq(brands.slug, cleanSlug))
      )
    )
    .orderBy(
      desc(
        sql<number>`CASE
          WHEN ${brands.name} ILIKE ${exactLike} ESCAPE '\\' THEN 100
          WHEN ${brands.slug} = ${cleanSlug} THEN 90
          WHEN ${brands.name} ILIKE ${prefixLike} ESCAPE '\\' THEN 80
          ELSE 50
        END`
      ),
      brands.name
    )
    .limit(safeLimit);
}

export function buildPredictiveCategoriesQuery(cleanQuery: string, limit = 3) {
  const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const exactLike = escaped;
  const prefixLike = `${escaped}%`;
  const containsLike = `%${escaped}%`;

  return db
    .select({
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .where(
      and(
        eq(categories.status, "PUBLISHED"),
        or(
          sql`${categories.name} ILIKE ${containsLike} ESCAPE '\\'`,
          eq(categories.slug, cleanSlug)
        )
      )
    )
    .orderBy(
      desc(
        sql<number>`CASE
          WHEN ${categories.name} ILIKE ${exactLike} ESCAPE '\\' THEN 100
          WHEN ${categories.slug} = ${cleanSlug} THEN 90
          WHEN ${categories.name} ILIKE ${prefixLike} ESCAPE '\\' THEN 80
          ELSE 50
        END`
      ),
      categories.displayOrder,
      categories.name
    )
    .limit(safeLimit);
}

export function buildSearchBrandFacetOptionsQuery(cleanQuery: string) {
  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);

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
            AND ${products.status} = 'PUBLISHED'
            AND ${categories.status} = 'PUBLISHED'
            AND ${productVariants.status} = 'ACTIVE'
            AND ${candidateWhere}
        )`
      )
    )
    .orderBy(brands.name);
}

export function buildSearchCategoryFacetOptionsQuery(cleanQuery: string) {
  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);

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
            AND ${products.status} = 'PUBLISHED'
            AND ${brands.status} = 'PUBLISHED'
            AND ${productVariants.status} = 'ACTIVE'
            AND ${candidateWhere}
        )`
      )
    )
    .orderBy(categories.name);
}

export function buildSearchTechnicalRepresentedSpecValuesQuery(
  cleanQuery: string,
  categoryId: string
) {
  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);

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
    .innerJoin(
      categorySpecificationSchemas,
      and(
        eq(categorySpecificationSchemas.id, productSpecifications.schemaId),
        eq(categorySpecificationSchemas.categoryId, products.categoryId),
        eq(categorySpecificationSchemas.schemaVersion, productSpecifications.schemaVersion)
      )
    )
    .where(
      and(
        eq(products.categoryId, categoryId),
        eq(products.status, "PUBLISHED"),
        candidateWhere,
        buildEligibleVariantExistsClause(null, null)
      )
    );
}

export function buildFullProductCountQuery(
  cleanQuery: string,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);
  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: 1,
  };

  const discoveryWhere = buildProductDiscoveryWhereClause(state, {
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
    .where(and(discoveryWhere, candidateWhere));
}

export function buildFullProductResultsQuery(
  cleanQuery: string,
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

  const candidateWhere = buildSearchCandidateWhereClause(cleanQuery);
  const relevance = buildRelevanceScoreExpression(cleanQuery);

  const state: DiscoveryFilterState = filterState ?? {
    brands: [],
    categories: [],
    price: { minCents: null, maxCents: null },
    technical: {},
    sort: null,
    page: safePage,
  };

  const discoveryWhere = buildProductDiscoveryWhereClause(state, {
    validatedSchema: schema ?? null,
  });

  const startingPriceSql = buildEligibleStartingPriceSql(
    state.price.minCents,
    state.price.maxCents
  );

  const sortOrderBys = buildProductSortOrderBy(
    state.sort,
    "search",
    state.price.minCents,
    state.price.maxCents
  );

  const orderByClauses = state.sort === null ? [desc(relevance), ...sortOrderBys] : sortOrderBys;

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
    .where(and(discoveryWhere, candidateWhere))
    .orderBy(...orderByClauses)
    .limit(safePageSize)
    .offset(offset);
}

export function buildFullMatchingBrandsQuery(cleanQuery: string, limit = 4) {
  const safeLimit = Math.max(1, Math.min(4, Math.trunc(limit)));
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const exactLike = escaped;
  const prefixLike = `${escaped}%`;
  const containsLike = `%${escaped}%`;

  return db
    .select({
      name: brands.name,
      slug: brands.slug,
    })
    .from(brands)
    .where(
      and(
        eq(brands.status, "PUBLISHED"),
        or(sql`${brands.name} ILIKE ${containsLike} ESCAPE '\\'`, eq(brands.slug, cleanSlug))
      )
    )
    .orderBy(
      desc(
        sql<number>`CASE
          WHEN ${brands.name} ILIKE ${exactLike} ESCAPE '\\' THEN 100
          WHEN ${brands.slug} = ${cleanSlug} THEN 90
          WHEN ${brands.name} ILIKE ${prefixLike} ESCAPE '\\' THEN 80
          ELSE 50
        END`
      ),
      brands.name
    )
    .limit(safeLimit);
}

export function buildFullMatchingCategoriesQuery(cleanQuery: string, limit = 4) {
  const safeLimit = Math.max(1, Math.min(4, Math.trunc(limit)));
  const escaped = escapeLikePattern(cleanQuery);
  const cleanSlug = cleanQuery.toLowerCase();
  const exactLike = escaped;
  const prefixLike = `${escaped}%`;
  const containsLike = `%${escaped}%`;

  return db
    .select({
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .where(
      and(
        eq(categories.status, "PUBLISHED"),
        or(
          sql`${categories.name} ILIKE ${containsLike} ESCAPE '\\'`,
          eq(categories.slug, cleanSlug)
        )
      )
    )
    .orderBy(
      desc(
        sql<number>`CASE
          WHEN ${categories.name} ILIKE ${exactLike} ESCAPE '\\' THEN 100
          WHEN ${categories.slug} = ${cleanSlug} THEN 90
          WHEN ${categories.name} ILIKE ${prefixLike} ESCAPE '\\' THEN 80
          ELSE 50
        END`
      ),
      categories.displayOrder,
      categories.name
    )
    .limit(safeLimit);
}
