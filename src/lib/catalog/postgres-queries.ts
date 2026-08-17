import "server-only";
import { and, countDistinct, desc, eq, min } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, mediaAssets, products, productVariants } from "@/db/schema";

/**
 * Production Drizzle Query Builders for PostgreSQL Catalog Discovery
 *
 * Exposes the exact query builder instances used by PostgresCatalogDiscoveryReader,
 * allowing unit tests to inspect query structure via `.toSQL()` without connecting to PostgreSQL.
 *
 * Publication & Security Invariants:
 * 1. Requires Product.status = 'PUBLISHED', Brand.status = 'PUBLISHED', Category.status = 'PUBLISHED'.
 * 2. Requires at least one ProductVariant.status = 'ACTIVE'.
 * 3. startingPriceCents is computed strictly as MIN(product_variants.price_cents) among ACTIVE variants.
 * 4. media_assets join enforces security_class = 'PUBLIC_MEDIA' and media_type = 'IMAGE'.
 * 5. cost_cents and supplier data are NEVER selected.
 * 6. Ordering is deterministic: products.created_at DESC, products.id DESC.
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

export function buildCategoryProductCountQuery(categoryId: string) {
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
    .innerJoin(
      productVariants,
      and(eq(products.id, productVariants.productId), eq(productVariants.status, "ACTIVE"))
    )
    .where(and(eq(products.categoryId, categoryId), eq(products.status, "PUBLISHED")));
}

export function buildBrandProductCountQuery(brandId: string) {
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
    .innerJoin(
      productVariants,
      and(eq(products.id, productVariants.productId), eq(productVariants.status, "ACTIVE"))
    )
    .where(and(eq(products.brandId, brandId), eq(products.status, "PUBLISHED")));
}

export function buildCategoryProductsQuery(categoryId: string, page: number, pageSize: number) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

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
    .where(and(eq(products.categoryId, categoryId), eq(products.status, "PUBLISHED")))
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
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(safePageSize)
    .offset(offset);
}

export function buildBrandProductsQuery(brandId: string, page: number, pageSize: number) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - 1) * safePageSize;

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
    .where(and(eq(products.brandId, brandId), eq(products.status, "PUBLISHED")))
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
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(safePageSize)
    .offset(offset);
}
