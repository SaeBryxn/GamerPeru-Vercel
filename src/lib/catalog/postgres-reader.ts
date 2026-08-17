import "server-only";
import { and, countDistinct, desc, eq, min } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, mediaAssets, products, productVariants } from "@/db/schema";
import type { CatalogDiscoveryReader } from "./reader";
import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";

/**
 * PostgreSQL Production Catalog Discovery Reader
 *
 * Implements server-side Drizzle queries against the physical PostgreSQL catalog.
 *
 * Publication & Security Invariants:
 * 1. Requires Product.status = 'PUBLISHED', Brand.status = 'PUBLISHED', Category.status = 'PUBLISHED'.
 * 2. Requires at least one ProductVariant.status = 'ACTIVE'.
 * 3. startingPriceCents is computed strictly as MIN(product_variants.price_cents) among ACTIVE variants.
 * 4. media_assets join enforces security_class = 'PUBLIC_MEDIA' and media_type = 'IMAGE'.
 * 5. cost_cents and supplier data are NEVER queried or projected.
 * 6. Uses DATABASE_URL only (never DATABASE_MIGRATION_URL).
 */
export class PostgresCatalogDiscoveryReader implements CatalogDiscoveryReader {
  async getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null> {
    const rows = await db
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

    return rows[0] ?? null;
  }

  async getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null> {
    const rows = await db
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

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const page = Math.max(1, Math.trunc(pagination.page));
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const offset = (page - 1) * pageSize;

    // Count eligible products (counting distinct product IDs)
    const countResult = await db
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

    const totalItems = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalItems === 0) {
      return {
        items: [],
        totalItems: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    // Paginated product query
    const rows = await db
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
      .limit(pageSize)
      .offset(offset);

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
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const page = Math.max(1, Math.trunc(pagination.page));
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const offset = (page - 1) * pageSize;

    // Count eligible products for brand
    const countResult = await db
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

    const totalItems = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalItems === 0) {
      return {
        items: [],
        totalItems: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    // Paginated product query for brand
    const rows = await db
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
      .limit(pageSize)
      .offset(offset);

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
