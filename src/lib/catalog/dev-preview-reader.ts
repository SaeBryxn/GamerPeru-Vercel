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
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_QA_BRAND,
  generateSyntheticProducts,
} from "./synthetic-catalog-data";
import type { SyntheticBrandEntry, SyntheticCategoryEntry } from "./synthetic-catalog-data";

/**
 * Development-Only Catalog Preview Reader
 *
 * Provides synthetic preview data for local storefront inspection when
 * the authoritative Supabase catalog contains zero commercial rows.
 *
 * INVARIANTS:
 * 1. PREVIEW DATA ONLY — not authoritative commerce truth.
 * 2. NEVER used in production (NODE_ENV !== "development" throws).
 * 3. NEVER used in CI (process.env.CI truthy throws).
 * 4. NEVER written to PostgreSQL.
 * 5. NEVER used as a database outage fallback.
 * 6. Activation requires explicit DEV_CATALOG_PREVIEW=1.
 *
 * Synthetic products use the neutral "Marca QA" brand exclusively.
 * No real commercial product models, SKUs, or inventory claims.
 */

// ---------------------------------------------------------------------------
// Preview entity maps
// ---------------------------------------------------------------------------

const PREVIEW_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
  ...SYNTHETIC_CATEGORIES,
};

const PREVIEW_BRANDS: Record<string, SyntheticBrandEntry> = {
  "marca-qa": SYNTHETIC_QA_BRAND,
  ...SYNTHETIC_NAV_BRANDS,
};

// ---------------------------------------------------------------------------
// Synthetic products by category — NOT COMMERCIAL DATA
// ---------------------------------------------------------------------------

const PREVIEW_PRODUCTS_BY_CATEGORY: Record<string, ProductDiscoveryItem[]> = {
  mouses: generateSyntheticProducts("mouses", "Mouses Gaming", 14),
  teclados: generateSyntheticProducts("teclados", "Teclados Gaming", 4),
  mousepads: generateSyntheticProducts("mousepads", "Mousepads Gaming", 4),
  audio: generateSyntheticProducts("audio", "Audio Gaming", 4),
  accesorios: generateSyntheticProducts("accesorios", "Accesorios Gaming", 4),
};

// All preview products belong to "Marca QA"
const ALL_PREVIEW_PRODUCTS: ProductDiscoveryItem[] = Object.values(
  PREVIEW_PRODUCTS_BY_CATEGORY
).flat();

// ---------------------------------------------------------------------------
// Reader implementation
// ---------------------------------------------------------------------------

export class DevCatalogPreviewReader implements CatalogDiscoveryReader {
  async getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null> {
    const entry = PREVIEW_CATEGORIES[slug];
    if (!entry || entry.status !== "PUBLISHED") {
      return null;
    }
    return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      description: entry.description,
      parentId: entry.parentId,
      displayOrder: entry.displayOrder,
    };
  }

  async getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null> {
    const entry = PREVIEW_BRANDS[slug];
    if (!entry || entry.status !== "PUBLISHED") {
      return null;
    }
    return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      description: entry.description,
      logo: entry.logo,
    };
  }

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const category = Object.values(PREVIEW_CATEGORIES).find(
      (c) => c.id === categoryId && c.status === "PUBLISHED"
    );

    if (!category) {
      return emptyPage(pagination);
    }

    const products = PREVIEW_PRODUCTS_BY_CATEGORY[category.slug] ?? [];
    return paginate(products, pagination);
  }

  async getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const brand = Object.values(PREVIEW_BRANDS).find(
      (b) => b.id === brandId && b.status === "PUBLISHED"
    );

    if (!brand) {
      return emptyPage(pagination);
    }

    const products = ALL_PREVIEW_PRODUCTS.filter((p) => p.brand.slug === brand.slug);
    return paginate(products, pagination);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paginate(
  items: ProductDiscoveryItem[],
  pagination: PaginationOptions
): PaginatedResult<ProductDiscoveryItem> {
  const totalItems = items.length;
  const pageSize = Math.max(1, Math.trunc(pagination.pageSize));
  const totalPages = Math.ceil(totalItems / pageSize);
  const page = Math.max(1, Math.trunc(pagination.page));
  const offset = (page - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    totalItems,
    page,
    pageSize,
    totalPages,
  };
}

function emptyPage(pagination: PaginationOptions): PaginatedResult<ProductDiscoveryItem> {
  return {
    items: [],
    totalItems: 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: 0,
  };
}
