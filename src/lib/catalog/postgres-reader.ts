import "server-only";
import {
  buildBrandProductCountQuery,
  buildBrandProductsQuery,
  buildCategoryProductCountQuery,
  buildCategoryProductsQuery,
  buildPublishedBrandBySlugQuery,
  buildPublishedCategoryBySlugQuery,
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
 * PostgreSQL Production Catalog Discovery Reader
 *
 * Implements server-side Drizzle queries against the physical PostgreSQL catalog
 * by delegating to canonical query builders.
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

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const page = Math.max(1, Math.trunc(pagination.page));
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));

    // Count eligible products (counting distinct product IDs)
    const countResult = await buildCategoryProductCountQuery(categoryId);
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
    const rows = await buildCategoryProductsQuery(categoryId, page, pageSize);

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

    // Count eligible products for brand
    const countResult = await buildBrandProductCountQuery(brandId);
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
    const rows = await buildBrandProductsQuery(brandId, page, pageSize);

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
