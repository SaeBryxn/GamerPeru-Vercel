import "server-only";
import type { CatalogDiscoveryReader } from "./reader";
import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";

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

const FIXTURE_CATEGORIES: Record<
  string,
  CategoryDiscoveryEntity & { status: "PUBLISHED" | "DRAFT" | "ARCHIVED" }
> = {
  mouses: {
    id: "018f0000-0000-7000-8000-000000000001",
    name: "Mouses Gaming",
    slug: "mouses",
    description: "Mouses de alto rendimiento para gaming competitivo.",
    parentId: null,
    displayOrder: 1,
    status: "PUBLISHED",
  },
  teclados: {
    id: "018f0000-0000-7000-8000-000000000002",
    name: "Teclados Mecánicos",
    slug: "teclados",
    description: "Teclados mecánicos y magnéticos de alta precisión.",
    parentId: null,
    displayOrder: 2,
    status: "PUBLISHED",
  },
  "categoria-vacia": {
    id: "018f0000-0000-7000-8000-000000000003",
    name: "Categoría Vacía",
    slug: "categoria-vacia",
    description: "Categoría de prueba sin productos asociados.",
    parentId: null,
    displayOrder: 3,
    status: "PUBLISHED",
  },
  "categoria-sin-descripcion": {
    id: "018f0000-0000-7000-8000-000000000004",
    name: "Categoría Sin Descripción",
    slug: "categoria-sin-descripcion",
    description: null,
    parentId: null,
    displayOrder: 4,
    status: "PUBLISHED",
  },
  "categoria-draft": {
    id: "018f0000-0000-7000-8000-000000000099",
    name: "Categoría Borrador",
    slug: "categoria-draft",
    description: "Categoría no publicada.",
    parentId: null,
    displayOrder: 99,
    status: "DRAFT",
  },
  "categoria-archived": {
    id: "018f0000-0000-7000-8000-000000000100",
    name: "Categoría Archivada",
    slug: "categoria-archived",
    description: "Categoría archivada del catálogo.",
    parentId: null,
    displayOrder: 100,
    status: "ARCHIVED",
  },
};

const FIXTURE_BRANDS: Record<
  string,
  BrandDiscoveryEntity & { status: "PUBLISHED" | "DRAFT" | "ARCHIVED" }
> = {
  "marca-qa": {
    id: "018f0000-0000-7000-8000-000000000010",
    name: "Marca QA",
    slug: "marca-qa",
    description: "Fabricante de hardware de prueba para control de calidad.",
    logo: null,
    status: "PUBLISHED",
  },
  "marca-vacia": {
    id: "018f0000-0000-7000-8000-000000000020",
    name: "Marca Vacía",
    slug: "marca-vacia",
    description: "Marca de prueba sin productos asociados.",
    logo: null,
    status: "PUBLISHED",
  },
  "marca-draft": {
    id: "018f0000-0000-7000-8000-000000000099",
    name: "Marca Borrador",
    slug: "marca-draft",
    description: "Marca no publicada.",
    logo: null,
    status: "DRAFT",
  },
  "marca-archived": {
    id: "018f0000-0000-7000-8000-000000000100",
    name: "Marca Archivada",
    slug: "marca-archived",
    description: "Marca archivada del catálogo.",
    logo: null,
    status: "ARCHIVED",
  },
};

// Generate 14 synthetic products to exercise 12-item pagination (Page 1 = 12, Page 2 = 2)
const FIXTURE_PRODUCTS: ProductDiscoveryItem[] = Array.from({ length: 14 }, (_, index) => {
  const num = String(index + 1).padStart(2, "0");
  const price = 12990 + index * 1000; // e.g. S/ 129.90, S/ 139.90...
  return {
    id: `018f0000-0000-7000-8000-0000000001${num}`,
    name: `Mouse Pro Mod ${num}`,
    slug: `mouse-pro-mod-${num}`,
    subtitle: `Edición de Rendimiento QA ${num}`,
    brand: {
      name: "Marca QA",
      slug: "marca-qa",
    },
    category: {
      name: "Mouses Gaming",
      slug: "mouses",
    },
    primaryMedia: null,
    startingPriceCents: price,
  };
});

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
