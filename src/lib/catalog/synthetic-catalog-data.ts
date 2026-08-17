/**
 * Gamer Perú — Synthetic Catalog Data
 *
 * Shared synthetic test/preview data used by:
 * - FixtureCatalogDiscoveryReader (Playwright E2E test suites)
 * - DevCatalogPreviewReader (local development catalog preview)
 *
 * INVARIANTS:
 * 1. This data is NEVER written to PostgreSQL.
 * 2. This data is NOT authoritative commerce truth.
 * 3. This data NEVER appears in production.
 * 4. Prices are synthetic test values in PEN minor-unit (centavos).
 * 5. No real commercial product models, SKUs, or inventory claims.
 */

import type { BrandDiscoveryEntity, CategoryDiscoveryEntity, ProductDiscoveryItem } from "./types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type SyntheticCategoryEntry = CategoryDiscoveryEntity & {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
};

/**
 * Core navigation categories matching the storefront global navigation.
 * Descriptions are neutral development-only copy.
 */
export const SYNTHETIC_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
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
    name: "Teclados Gaming",
    slug: "teclados",
    description: "Teclados mecánicos y magnéticos de alta precisión.",
    parentId: null,
    displayOrder: 2,
    status: "PUBLISHED",
  },
  mousepads: {
    id: "018f0000-0000-7000-8000-000000000003",
    name: "Mousepads Gaming",
    slug: "mousepads",
    description: "Mousepads de control y velocidad para gaming competitivo.",
    parentId: null,
    displayOrder: 3,
    status: "PUBLISHED",
  },
  audio: {
    id: "018f0000-0000-7000-8000-000000000004",
    name: "Audio Gaming",
    slug: "audio",
    description: "Audio IEM y auriculares para gaming y esports.",
    parentId: null,
    displayOrder: 4,
    status: "PUBLISHED",
  },
  accesorios: {
    id: "018f0000-0000-7000-8000-000000000005",
    name: "Accesorios Gaming",
    slug: "accesorios",
    description: "Accesorios y periféricos complementarios para gaming.",
    parentId: null,
    displayOrder: 5,
    status: "PUBLISHED",
  },
};

// ---------------------------------------------------------------------------
// Test-only categories (not part of storefront navigation)
// ---------------------------------------------------------------------------

export const SYNTHETIC_TEST_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
  "categoria-vacia": {
    id: "018f0000-0000-7000-8000-000000000090",
    name: "Categoría Vacía",
    slug: "categoria-vacia",
    description: "Categoría de prueba sin productos asociados.",
    parentId: null,
    displayOrder: 90,
    status: "PUBLISHED",
  },
  "categoria-sin-descripcion": {
    id: "018f0000-0000-7000-8000-000000000091",
    name: "Categoría Sin Descripción",
    slug: "categoria-sin-descripcion",
    description: null,
    parentId: null,
    displayOrder: 91,
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

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export type SyntheticBrandEntry = BrandDiscoveryEntity & {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
};

/** Neutral synthetic brand used for populated preview products. */
export const SYNTHETIC_QA_BRAND: SyntheticBrandEntry = {
  id: "018f0000-0000-7000-8000-000000000010",
  name: "Marca QA",
  slug: "marca-qa",
  description: "Fabricante de hardware de prueba para control de calidad.",
  logo: null,
  status: "PUBLISHED",
};

/**
 * Navigation brand entities — LOCAL PREVIEW ROUTE ENTITIES ONLY.
 *
 * These do NOT assert that Gamer Perú currently stocks, distributes,
 * imports, or officially represents these brands. No commercial claims.
 * No logos. No remote media.
 */
export const SYNTHETIC_NAV_BRANDS: Record<string, SyntheticBrandEntry> = {
  wlmouse: {
    id: "018f0000-0000-7000-8000-000000000b01",
    name: "WLMouse",
    slug: "wlmouse",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  pulsar: {
    id: "018f0000-0000-7000-8000-000000000b02",
    name: "Pulsar",
    slug: "pulsar",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  lamzu: {
    id: "018f0000-0000-7000-8000-000000000b03",
    name: "Lamzu",
    slug: "lamzu",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  atk: {
    id: "018f0000-0000-7000-8000-000000000b04",
    name: "ATK",
    slug: "atk",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  ninjutso: {
    id: "018f0000-0000-7000-8000-000000000b05",
    name: "Ninjutso",
    slug: "ninjutso",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  wooting: {
    id: "018f0000-0000-7000-8000-000000000b06",
    name: "Wooting",
    slug: "wooting",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  drunkdeer: {
    id: "018f0000-0000-7000-8000-000000000b07",
    name: "DrunkDeer",
    slug: "drunkdeer",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  melgeek: {
    id: "018f0000-0000-7000-8000-000000000b08",
    name: "MelGeek",
    slug: "melgeek",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  artisan: {
    id: "018f0000-0000-7000-8000-000000000b09",
    name: "Artisan",
    slug: "artisan",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  lgg: {
    id: "018f0000-0000-7000-8000-000000000b10",
    name: "LGG",
    slug: "lgg",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  moondrop: {
    id: "018f0000-0000-7000-8000-000000000b11",
    name: "Moondrop",
    slug: "moondrop",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  tangzu: {
    id: "018f0000-0000-7000-8000-000000000b12",
    name: "Tangzu",
    slug: "tangzu",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  truthear: {
    id: "018f0000-0000-7000-8000-000000000b13",
    name: "Truthear",
    slug: "truthear",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
  sennheiser: {
    id: "018f0000-0000-7000-8000-000000000b14",
    name: "Sennheiser",
    slug: "sennheiser",
    description: null,
    logo: null,
    status: "PUBLISHED",
  },
};

/** Test-only brands (not part of storefront navigation). */
export const SYNTHETIC_TEST_BRANDS: Record<string, SyntheticBrandEntry> = {
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

// ---------------------------------------------------------------------------
// Synthetic Products — NOT COMMERCIAL DATA
// ---------------------------------------------------------------------------

/**
 * Generates synthetic QA products for a given category.
 *
 * All products use the neutral "Marca QA" brand.
 * Prices are synthetic test values (NOT commercial pricing).
 * primaryMedia is null to exercise the GP-011 fallback media stage.
 */
export function generateSyntheticProducts(
  categorySlug: string,
  categoryName: string,
  count: number,
  startIndex: number = 1
): ProductDiscoveryItem[] {
  const getProductPrefix = (slug: string): string => {
    switch (slug) {
      case "mouses":
        return "Mouse Pro Mod";
      case "teclados":
        return "Teclado QA";
      case "mousepads":
        return "Mousepad QA";
      case "audio":
        return "Audio QA";
      case "accesorios":
        return "Accesorio QA";
      default:
        return `${categoryName} QA`;
    }
  };

  const getSlugPrefix = (slug: string): string => {
    switch (slug) {
      case "mouses":
        return "mouse-pro-mod";
      case "teclados":
        return "teclado-qa";
      case "mousepads":
        return "mousepad-qa";
      case "audio":
        return "audio-qa";
      case "accesorios":
        return "accesorio-qa";
      default:
        return `${slug}-qa`;
    }
  };

  const getSlugIdPrefix = (slug: string): string => {
    switch (slug) {
      case "mouses":
        return "mous";
      case "teclados":
        return "tecl";
      case "mousepads":
        return "mpad";
      case "audio":
        return "audi";
      case "accesorios":
        return "acce";
      default:
        return slug.slice(0, 4).padEnd(4, "0");
    }
  };

  const namePrefix = getProductPrefix(categorySlug);
  const slugPrefix = getSlugPrefix(categorySlug);
  const idPrefix = getSlugIdPrefix(categorySlug);

  return Array.from({ length: count }, (_, i) => {
    const num = String(startIndex + i).padStart(2, "0");
    const price = 12990 + (startIndex + i - 1) * 1000; // Synthetic PEN centavos
    return {
      id: `018f0000-0000-7000-8000-${idPrefix}${num.padStart(4, "0")}`,
      name: `${namePrefix} ${num}`,
      slug: `${slugPrefix}-${num}`,
      subtitle: `Edición de Rendimiento QA ${num}`,
      brand: {
        name: SYNTHETIC_QA_BRAND.name,
        slug: SYNTHETIC_QA_BRAND.slug,
      },
      category: {
        name: categoryName,
        slug: categorySlug,
      },
      primaryMedia: null,
      startingPriceCents: price,
    };
  });
}
