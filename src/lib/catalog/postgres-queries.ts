import "server-only";
import { and, countDistinct, desc, eq, sql, type SQL } from "drizzle-orm";
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
  DiscoverySurface,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";
import {
  cardCompareAtSql,
  cardGallerySql,
  cardSingleVariantSql,
  cardVariantColorsSql,
} from "./card-sql";

/**
 * Asset shown on a discovery card.
 *
 * A product can carry images without one being designated primary — the operator simply has not
 * chosen yet. Falling back to its first global image keeps a real photo on the card instead of a
 * grey placeholder, while a designated primary always wins when it exists.
 */
const CARD_MEDIA_ASSET_ID = sql`COALESCE(
  ${products.primaryMediaId},
  (
    SELECT a.id
    FROM product_media pm
    JOIN media_assets a ON a.id = pm.media_asset_id
    WHERE pm.product_id = ${products.id}
      AND pm.placement = 'GALLERY'
      AND a.security_class = 'PUBLIC_MEDIA'
      AND a.media_type = 'IMAGE'
    ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
    LIMIT 1
  )
)`;

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

/** Published brands that sell at least one published product, with their logo, by name. */
export function buildShowcaseBrandsQuery() {
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
        )`
      )
    )
    .orderBy(brands.name);
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

/** Brands with published products in a category, or across the whole catalog when it is null. */
export function buildCategoryBrandFacetOptionsQuery(categoryId: string | null) {
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
            ${categoryId ? sql`AND ${products.categoryId} = ${categoryId}` : sql``}
            AND ${products.status} = 'PUBLISHED'
            AND ${categories.status} = 'PUBLISHED'
            AND ${productVariants.status} = 'ACTIVE'
        )`
      )
    )
    .orderBy(brands.name);
}

/** Categories with published products of a brand, or across the whole catalog when it is null. */
export function buildBrandCategoryFacetOptionsQuery(brandId: string | null) {
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
            ${brandId ? sql`AND ${products.brandId} = ${brandId}` : sql``}
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
  brandId?: string | null
) {
  const whereConditions = [
    eq(products.categoryId, categoryId),
    eq(products.status, "PUBLISHED"),
    eq(brands.status, "PUBLISHED"),
    eq(categories.status, "PUBLISHED"),
    buildEligibleVariantExistsClause(null, null),
  ];

  if (brandId) {
    whereConditions.push(eq(products.brandId, brandId));
  }

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
    .where(and(...whereConditions));
}

const UNFILTERED_STATE: Omit<DiscoveryFilterState, "page"> = {
  brands: [],
  categories: [],
  price: { minCents: null, maxCents: null },
  technical: {},
  sort: null,
};

export function buildCategoryFilteredProductCountQuery(
  categoryId: string,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductCountQuery({ categoryId }, filterState, schema);
}

export function buildBrandFilteredProductCountQuery(
  brandId: string,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductCountQuery({ brandId }, filterState, schema);
}

/** Published products across every category and brand, filtered by the discovery state. */
export function buildCatalogProductCountQuery(
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductCountQuery({}, filterState, schema);
}

function buildDiscoveryProductCountQuery(
  scope: { categoryId?: string; brandId?: string },
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  const state: DiscoveryFilterState = filterState ?? { ...UNFILTERED_STATE, page: 1 };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    ...scope,
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

interface DiscoveryProductsQueryOptions {
  scope: { categoryId?: string; brandId?: string; productIds?: readonly string[] };
  surface: DiscoverySurface;
  page: number;
  pageSize: number;
  filterState?: DiscoveryFilterState;
  schema?: ValidatedSpecificationSchema | null;
  /** Ordering applied ahead of the requested sort. */
  leadingOrder?: SQL[];
}

/** Card rows for a discovery surface: the shape every product card on the storefront reads. */
function buildDiscoveryProductsQuery({
  scope,
  surface,
  page,
  pageSize,
  filterState,
  schema,
  leadingOrder = [],
}: DiscoveryProductsQueryOptions) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

  const state: DiscoveryFilterState = filterState ?? { ...UNFILTERED_STATE, page: safePage };

  const whereClause = buildProductDiscoveryWhereClause(state, {
    ...scope,
    validatedSchema: schema ?? null,
  });

  const startingPriceSql = buildEligibleStartingPriceSql(
    state.price.minCents,
    state.price.maxCents
  );

  const orderByClauses = buildProductSortOrderBy(
    state.sort,
    surface,
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
      compareAtPriceCents: cardCompareAtSql(startingPriceSql),
      gallery: cardGallerySql,
      singleVariantId: cardSingleVariantSql,
      variantColors: cardVariantColorsSql,
      specValues: productSpecifications.specValues,
      specFieldDefinitions: categorySpecificationSchemas.fieldDefinitions,
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
        sql`${mediaAssets.id} = ${CARD_MEDIA_ASSET_ID}`,
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .leftJoin(productSpecifications, eq(productSpecifications.productId, products.id))
    .leftJoin(
      categorySpecificationSchemas,
      and(
        eq(categorySpecificationSchemas.categoryId, products.categoryId),
        eq(categorySpecificationSchemas.isActive, true)
      )
    )
    .where(whereClause)
    .orderBy(...leadingOrder, ...orderByClauses)
    .limit(safePageSize)
    .offset(offset);
}

export function buildCategoryFilteredProductsQuery(
  categoryId: string,
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductsQuery({
    scope: { categoryId },
    surface: "category",
    page,
    pageSize,
    filterState,
    schema,
  });
}

export function buildBrandFilteredProductsQuery(
  brandId: string,
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductsQuery({
    scope: { brandId },
    surface: "brand",
    page,
    pageSize,
    filterState,
    schema,
  });
}

/** Card rows for the full catalog listing, filtered and sorted like any discovery surface. */
export function buildCatalogProductsQuery(
  page: number,
  pageSize: number,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
) {
  return buildDiscoveryProductsQuery({
    scope: {},
    surface: "search",
    page,
    pageSize,
    filterState,
    schema,
  });
}

/** Published products across every category, featured ones first, then newest. */
export function buildShowcaseProductsQuery(limit: number) {
  return buildDiscoveryProductsQuery({
    scope: {},
    surface: "search",
    page: 1,
    pageSize: limit,
    leadingOrder: [desc(products.isFeatured)],
  });
}

/** Card rows for specific products (e.g. a customer's wishlist), still limited to published ones. */
export function buildPublishedProductsByIdsQuery(productIds: readonly string[]) {
  return buildDiscoveryProductsQuery({
    scope: { productIds },
    surface: "search",
    page: 1,
    pageSize: productIds.length,
  });
}
