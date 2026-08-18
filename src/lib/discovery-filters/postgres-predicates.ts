import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  brands,
  categories,
  categorySpecificationSchemas,
  productSpecifications,
  products,
  productVariants,
} from "@/db/schema";
import type {
  DiscoveryFilterState,
  DiscoverySort,
  DiscoverySurface,
  NumberRangeFilter,
  ValidatedSpecificationField,
  ValidatedSpecificationSchema,
} from "./types";

/**
 * Builds the SQL expression for the single authoritative startingPriceCents
 * computed only from EligibleVariants matching price filters.
 */
export function buildEligibleStartingPriceSql(
  minPriceCents: number | null,
  maxPriceCents: number | null
): SQL<number> {
  const conditions: SQL[] = [
    sql`${productVariants.productId} = ${products.id}`,
    sql`${productVariants.status} = 'ACTIVE'`,
  ];

  if (minPriceCents !== null) {
    conditions.push(sql`${productVariants.priceCents} >= ${minPriceCents}`);
  }
  if (maxPriceCents !== null) {
    conditions.push(sql`${productVariants.priceCents} <= ${maxPriceCents}`);
  }

  return sql<number>`(
    SELECT MIN(${productVariants.priceCents})
    FROM ${productVariants}
    WHERE ${and(...conditions)}
  )`;
}

/**
 * Builds the EXISTS condition ensuring at least one EligibleVariant exists for the Product.
 */
export function buildEligibleVariantExistsClause(
  minPriceCents: number | null,
  maxPriceCents: number | null
): SQL {
  const conditions: SQL[] = [
    sql`${productVariants.productId} = ${products.id}`,
    sql`${productVariants.status} = 'ACTIVE'`,
  ];

  if (minPriceCents !== null) {
    conditions.push(sql`${productVariants.priceCents} >= ${minPriceCents}`);
  }
  if (maxPriceCents !== null) {
    conditions.push(sql`${productVariants.priceCents} <= ${maxPriceCents}`);
  }

  return sql`EXISTS (
    SELECT 1
    FROM ${productVariants}
    WHERE ${and(...conditions)}
  )`;
}

/**
 * Builds defensive technical specification filter conditions for ProductSpecifications.
 */
export function buildTechnicalFilterConditions(
  technicalFilters: Record<string, unknown>,
  validatedSchema: ValidatedSpecificationSchema | null
): SQL[] {
  if (!validatedSchema || Object.keys(technicalFilters).length === 0) {
    return [];
  }

  const fieldMap = new Map<string, ValidatedSpecificationField>();
  for (const f of validatedSchema.fieldDefinitions) {
    if (f.filterable && f.publicParam) {
      fieldMap.set(f.key, f);
    }
  }

  const conditions: SQL[] = [];

  for (const [key, rawVal] of Object.entries(technicalFilters)) {
    const field = fieldMap.get(key);
    if (!field) continue;

    if (field.filterKind === "ENUM_MULTI" && Array.isArray(rawVal) && rawVal.length > 0) {
      const validOptions = new Set((field.options ?? []).map((o) => o.value));
      const filteredVals = rawVal.filter(
        (v): v is string => typeof v === "string" && validOptions.has(v)
      );
      if (filteredVals.length === 0) continue;

      // OR across same facet values: ps.spec_values @> '{"key": "val1"}' OR ps.spec_values @> '{"key": "val2"}'
      const orClauses = filteredVals.map((v) => {
        const jsonSnippet = JSON.stringify({ [field.key]: v });
        return sql`${productSpecifications.specValues} @> ${jsonSnippet}::jsonb`;
      });

      const enumSubquery = sql`EXISTS (
        SELECT 1
        FROM ${productSpecifications}
        JOIN ${categorySpecificationSchemas}
          ON ${categorySpecificationSchemas.id} = ${productSpecifications.schemaId}
        WHERE ${productSpecifications.productId} = ${products.id}
          AND ${categorySpecificationSchemas.categoryId} = ${products.categoryId}
          AND ${productSpecifications.schemaVersion} = ${categorySpecificationSchemas.schemaVersion}
          AND (${sql.join(orClauses, sql` OR `)})
      )`;

      conditions.push(enumSubquery);
    } else if (
      field.filterKind === "NUMBER_RANGE" &&
      typeof rawVal === "object" &&
      rawVal !== null
    ) {
      const range = rawVal as NumberRangeFilter;
      if (range.min === undefined && range.max === undefined) continue;

      const rangeSubConditions: SQL[] = [
        sql`${productSpecifications.productId} = ${products.id}`,
        sql`${categorySpecificationSchemas.id} = ${productSpecifications.schemaId}`,
        sql`${categorySpecificationSchemas.categoryId} = ${products.categoryId}`,
        sql`${productSpecifications.schemaVersion} = ${categorySpecificationSchemas.schemaVersion}`,
        sql`jsonb_typeof(${productSpecifications.specValues}->${field.key}) = 'number'`,
      ];

      if (range.min !== undefined) {
        rangeSubConditions.push(
          sql`(${productSpecifications.specValues}->>${field.key})::numeric >= ${range.min}`
        );
      }
      if (range.max !== undefined) {
        rangeSubConditions.push(
          sql`(${productSpecifications.specValues}->>${field.key})::numeric <= ${range.max}`
        );
      }

      const numberSubquery = sql`EXISTS (
        SELECT 1
        FROM ${productSpecifications}
        JOIN ${categorySpecificationSchemas}
          ON ${categorySpecificationSchemas.id} = ${productSpecifications.schemaId}
        WHERE ${and(...rangeSubConditions)}
      )`;

      conditions.push(numberSubquery);
    } else if (field.filterKind === "BOOLEAN" && rawVal === true) {
      const jsonSnippet = JSON.stringify({ [field.key]: true });
      const booleanSubquery = sql`EXISTS (
        SELECT 1
        FROM ${productSpecifications}
        JOIN ${categorySpecificationSchemas}
          ON ${categorySpecificationSchemas.id} = ${productSpecifications.schemaId}
        WHERE ${productSpecifications.productId} = ${products.id}
          AND ${categorySpecificationSchemas.categoryId} = ${products.categoryId}
          AND ${productSpecifications.schemaVersion} = ${categorySpecificationSchemas.schemaVersion}
          AND ${productSpecifications.specValues} @> ${jsonSnippet}::jsonb
      )`;

      conditions.push(booleanSubquery);
    }
  }

  return conditions;
}

/**
 * Builds the complete WHERE clause for filtered product discovery.
 */
export function buildProductDiscoveryWhereClause(
  filterState: DiscoveryFilterState,
  options?: {
    categoryId?: string;
    brandId?: string;
    validatedSchema?: ValidatedSpecificationSchema | null;
  }
): SQL {
  const conditions: SQL[] = [
    eq(products.status, "PUBLISHED"),
    eq(brands.status, "PUBLISHED"),
    eq(categories.status, "PUBLISHED"),
    buildEligibleVariantExistsClause(filterState.price.minCents, filterState.price.maxCents),
  ];

  // Fixed Category (on /categorias/[slug])
  if (options?.categoryId) {
    conditions.push(eq(products.categoryId, options.categoryId));
  }

  // Fixed Brand (on /marcas/[slug])
  if (options?.brandId) {
    conditions.push(eq(products.brandId, options.brandId));
  }

  // Selected Brands multi-filter
  if (filterState.brands.length > 0) {
    conditions.push(
      sql`${products.brandId} IN (
        SELECT ${brands.id}
        FROM ${brands}
        WHERE ${brands.status} = 'PUBLISHED'
          AND ${inArray(brands.slug, filterState.brands)}
      )`
    );
  }

  // Selected Categories multi-filter (on Brand / Search)
  if (filterState.categories.length > 0) {
    conditions.push(
      sql`${products.categoryId} IN (
        SELECT ${categories.id}
        FROM ${categories}
        WHERE ${categories.status} = 'PUBLISHED'
          AND ${inArray(categories.slug, filterState.categories)}
      )`
    );
  }

  // Technical specification filters
  const techConditions = buildTechnicalFilterConditions(
    filterState.technical,
    options?.validatedSchema ?? null
  );
  if (techConditions.length > 0) {
    conditions.push(...techConditions);
  }

  return and(...conditions)!;
}

/**
 * Maps DiscoverySort to SQL ORDER BY clauses.
 */
export function buildProductSortOrderBy(
  sort: DiscoverySort,
  surface: DiscoverySurface,
  minPriceCents: number | null,
  maxPriceCents: number | null
): SQL[] {
  const startingPriceSql = buildEligibleStartingPriceSql(minPriceCents, maxPriceCents);

  if (sort === "precio-menor") {
    return [asc(startingPriceSql), desc(products.createdAt), desc(products.id)];
  }

  if (sort === "precio-mayor") {
    return [desc(startingPriceSql), desc(products.createdAt), desc(products.id)];
  }

  if (sort === "nombre-asc") {
    return [asc(products.name), asc(products.id)];
  }

  if (sort === "nombre-desc") {
    return [desc(products.name), desc(products.id)];
  }

  if (sort === "recientes") {
    return [desc(products.createdAt), desc(products.id)];
  }

  // Default:
  // For Category/Brand: newest first
  // For Search: relevance expression is handled outside (or fallback to newest)
  return [desc(products.createdAt), desc(products.id)];
}
