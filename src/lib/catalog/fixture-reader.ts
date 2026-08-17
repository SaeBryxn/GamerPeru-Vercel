import "server-only";
import type { CatalogDiscoveryReader } from "./reader";
import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_QA_BRAND,
  SYNTHETIC_TEST_BRANDS,
  SYNTHETIC_TEST_CATEGORIES,
  generateSyntheticProducts,
} from "./synthetic-catalog-data";
import type { SyntheticBrandEntry, SyntheticCategoryEntry } from "./synthetic-catalog-data";

/**
 * Synthetic Test Fixture Catalog Discovery Reader
 *
 * Provides deterministic, isolated test fixtures for Playwright E2E and visual QA
 * suites without requiring live Supabase credentials in CI.
 *
 * Security & Data Invariant:
 * 1. This reader contains purely synthetic TEST DATA.
 * 2. It is NEVER used in production.
 * 3. It never writes to PostgreSQL.
 * 4. It can only be activated when E2E_CATALOG_FIXTURES=1 and PLAYWRIGHT_TEST=1 in non-production.
 */

const FIXTURE_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
  // Include the "mouses" and "teclados" categories used by existing E2E tests
  mouses: SYNTHETIC_CATEGORIES["mouses"]!,
  teclados: SYNTHETIC_CATEGORIES["teclados"]!,
  // Test-only categories
  ...SYNTHETIC_TEST_CATEGORIES,
};

const FIXTURE_BRANDS: Record<string, SyntheticBrandEntry> = {
  "marca-qa": SYNTHETIC_QA_BRAND,
  ...SYNTHETIC_TEST_BRANDS,
};

// Generate 14 synthetic products to exercise 12-item pagination (Page 1 = 12, Page 2 = 2)
const FIXTURE_PRODUCTS: ProductDiscoveryItem[] = generateSyntheticProducts(
  "mouses",
  "Mouses Gaming",
  14
);

export class FixtureCatalogDiscoveryReader implements CatalogDiscoveryReader {
  async getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null> {
    const item = FIXTURE_CATEGORIES[slug];
    if (!item || item.status !== "PUBLISHED") {
      return null;
    }
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      parentId: item.parentId,
      displayOrder: item.displayOrder,
    };
  }

  async getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null> {
    const item = FIXTURE_BRANDS[slug];
    if (!item || item.status !== "PUBLISHED") {
      return null;
    }
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      logo: item.logo,
    };
  }

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const targetCategory = Object.values(FIXTURE_CATEGORIES).find(
      (c) => c.id === categoryId && c.status === "PUBLISHED"
    );

    if (!targetCategory || targetCategory.slug === "categoria-vacia") {
      return {
        items: [],
        totalItems: 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: 0,
      };
    }

    const filtered = FIXTURE_PRODUCTS.filter((p) => p.category.slug === targetCategory.slug);
    const totalItems = filtered.length;
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const totalPages = Math.ceil(totalItems / pageSize);
    const page = Math.max(1, Math.trunc(pagination.page));
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

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
    const targetBrand = Object.values(FIXTURE_BRANDS).find(
      (b) => b.id === brandId && b.status === "PUBLISHED"
    );

    if (!targetBrand || targetBrand.slug === "marca-vacia") {
      return {
        items: [],
        totalItems: 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: 0,
      };
    }

    const filtered = FIXTURE_PRODUCTS.filter((p) => p.brand.slug === targetBrand.slug);
    const totalItems = filtered.length;
    const pageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const totalPages = Math.ceil(totalItems / pageSize);
    const page = Math.max(1, Math.trunc(pagination.page));
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };
  }
}
