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

import type {
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  ProductDiscoveryItem,
  ProductDetailEntity,
  ProductMediaItem,
  ProductVariantDetail,
  ProductSpecificationDetail,
  ProductStoryDetail,
} from "./types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type SyntheticCategoryEntry = CategoryDiscoveryEntity & {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
};

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
// Specification Schemas
// ---------------------------------------------------------------------------

export const SYNTHETIC_SPEC_SCHEMAS: Record<string, ValidatedSpecificationSchema> = {
  mouses: {
    id: "018f0000-0000-7000-8000-000000000s01",
    categoryId: "018f0000-0000-7000-8000-000000000001",
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "weight_g",
        label: "Peso",
        dataType: "number",
        unit: "g",
        filterable: true,
        filterKind: "NUMBER_RANGE",
        publicParam: "peso",
        displayOrder: 1,
        min: 30,
        max: 70,
      },
      {
        key: "shape",
        label: "Forma",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "forma",
        displayOrder: 2,
        options: [
          { value: "simetrico", label: "Simétrico" },
          { value: "ergonomico", label: "Ergonómico" },
        ],
      },
      {
        key: "sensor",
        label: "Sensor",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "sensor",
        displayOrder: 3,
        options: [
          { value: "paw3950", label: "PAW3950" },
          { value: "paw3395", label: "PAW3395" },
        ],
      },
      {
        key: "polling_rate_hz",
        label: "Polling Rate",
        dataType: "number",
        unit: "Hz",
        filterable: true,
        filterKind: "NUMBER_RANGE",
        publicParam: "polling",
        displayOrder: 4,
      },
      {
        key: "hotswap",
        label: "Hot-Swap",
        dataType: "boolean",
        filterable: true,
        filterKind: "BOOLEAN",
        publicParam: "hotswap",
        displayOrder: 5,
      },
    ],
  },
  teclados: {
    id: "018f0000-0000-7000-8000-000000000s02",
    categoryId: "018f0000-0000-7000-8000-000000000002",
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "formato",
        label: "Formato",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "formato",
        displayOrder: 1,
        options: [
          { value: "60", label: "60%" },
          { value: "65", label: "65%" },
          { value: "75", label: "75%" },
          { value: "tkl", label: "TKL" },
        ],
      },
      {
        key: "switch_type",
        label: "Tipo de Switch",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "tipo_switch",
        displayOrder: 2,
        options: [
          { value: "magnetico", label: "Magnético" },
          { value: "mecanico", label: "Mecánico" },
        ],
      },
    ],
  },
  mousepads: {
    id: "018f0000-0000-7000-8000-000000000s03",
    categoryId: "018f0000-0000-7000-8000-000000000003",
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "surface",
        label: "Superficie",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "superficie",
        displayOrder: 1,
        options: [
          { value: "vidrio", label: "Vidrio" },
          { value: "control", label: "Control" },
          { value: "speed", label: "Speed" },
        ],
      },
      {
        key: "size_class",
        label: "Tamaño",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "tamano",
        displayOrder: 2,
        options: [
          { value: "xl", label: "XL" },
          { value: "xxl", label: "XXL" },
        ],
      },
    ],
  },
  audio: {
    id: "018f0000-0000-7000-8000-000000000s04",
    categoryId: "018f0000-0000-7000-8000-000000000004",
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "audio_type",
        label: "Tipo de Audio",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "tipo_audio",
        displayOrder: 1,
        options: [
          { value: "iem", label: "IEM" },
          { value: "open-back", label: "Open-Back" },
          { value: "dac", label: "DAC" },
        ],
      },
    ],
  },
  accesorios: {
    id: "018f0000-0000-7000-8000-000000000s05",
    categoryId: "018f0000-0000-7000-8000-000000000005",
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "accessory_type",
        label: "Tipo de Accesorio",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "tipo_accesorio",
        displayOrder: 1,
        options: [
          { value: "skates", label: "Skates" },
          { value: "grip-tapes", label: "Grip Tapes" },
          { value: "dongles", label: "Dongles" },
          { value: "switches", label: "Switches" },
          { value: "keycaps", label: "Keycaps" },
          { value: "modding", label: "Modding" },
          { value: "cables", label: "Cables" },
          { value: "bungees", label: "Bungees" },
          { value: "soportes", label: "Soportes" },
          { value: "herramientas", label: "Herramientas" },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export type SyntheticBrandEntry = BrandDiscoveryEntity & {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
};

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

export const SYNTHETIC_QA_BRAND: SyntheticBrandEntry = {
  id: "018f0000-0000-7000-8000-000000000010",
  name: "Marca QA",
  slug: "marca-qa",
  description: "Fabricante de hardware de prueba para control de calidad.",
  logo: null,
  status: "PUBLISHED",
};

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
// Synthetic Products & Specifications Data
// ---------------------------------------------------------------------------

export interface SyntheticProductWithSpecs extends ProductDiscoveryItem {
  specValues: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt?: string;
}

export function generateSyntheticProducts(
  categorySlug: string,
  categoryName: string,
  count: number,
  startIndex: number = 1
): SyntheticProductWithSpecs[] {
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

  const namePrefix = getProductPrefix(categorySlug);
  const slugPrefix = getSlugPrefix(categorySlug);

  const prefixMap: Record<string, string> = {
    mouses: "mous",
    teclados: "tecl",
    mousepads: "mpad",
    audio: "audi",
    accesorios: "acce",
  };
  const prefix = prefixMap[categorySlug] ?? categorySlug.slice(0, 4).padEnd(4, "0");

  return Array.from({ length: count }, (_, i) => {
    const idx = startIndex + i;
    const id = `018f0000-0000-7000-8000-${prefix}${String(idx).padStart(4, "0")}`;
    const num = String(idx).padStart(2, "0");
    const price = 12990 + (idx - 1) * 2000; // S/ 129.90, S/ 149.90, S/ 169.90...
    const brand = SYNTHETIC_QA_BRAND;

    // Rich technical specs depending on category
    let specValues: Record<string, string | number | boolean | null> = {};
    if (categorySlug === "mouses") {
      specValues = {
        weight_g: idx % 2 === 0 ? 39 : 52, // Under 45g or over 45g
        shape: idx % 3 === 0 ? "ergonomico" : "simetrico",
        sensor: idx % 2 === 0 ? "paw3950" : "paw3395",
        polling_rate_hz: idx % 2 === 0 ? 8000 : 1000,
        hotswap: idx % 2 === 0,
      };
    } else if (categorySlug === "teclados") {
      specValues = {
        formato: idx % 2 === 0 ? "60" : "75",
        switch_type: idx % 2 === 0 ? "magnetico" : "mecanico",
      };
    } else if (categorySlug === "mousepads") {
      specValues = {
        surface: idx % 3 === 0 ? "vidrio" : idx % 3 === 1 ? "control" : "speed",
        size_class: idx % 2 === 0 ? "xl" : "xxl",
      };
    } else if (categorySlug === "audio") {
      specValues = {
        tipo_audio: idx % 3 === 0 ? "iem" : idx % 3 === 1 ? "open-back" : "dac",
      };
    } else if (categorySlug === "accesorios") {
      const types = ["skates", "grip-tapes", "dongles", "switches", "keycaps", "modding"];
      specValues = {
        tipo_accesorio: types[(idx - 1) % types.length]!,
      };
    }

    return {
      id,
      name: `${namePrefix} ${num}`,

      slug: `${slugPrefix}-${num}`,
      subtitle: `Edición de Rendimiento QA ${num}`,
      brand: {
        name: brand.name,
        slug: brand.slug,
      },
      category: {
        name: categoryName,
        slug: categorySlug,
      },
      primaryMedia: null,
      startingPriceCents: price,
      specValues,
      createdAt: new Date(1700000000000 - idx * 100000).toISOString(),
      updatedAt: new Date(1700000000000 - idx * 100000).toISOString(),
    };
  });
}

/**
 * In-memory filter and sort helper for synthetic preview/fixture products.
 */
export function filterAndSortSyntheticProducts(
  allProducts: SyntheticProductWithSpecs[],
  filterState?: DiscoveryFilterState,
  surface: "category" | "brand" | "search" = "category",
  schema?: ValidatedSpecificationSchema | null
): SyntheticProductWithSpecs[] {
  if (!filterState) return [...allProducts];

  let filtered = allProducts.filter((p) => {
    // Brand filter
    if (surface !== "brand" && filterState.brands.length > 0) {
      if (!filterState.brands.includes(p.brand.slug)) return false;
    }

    // Category filter
    if (surface !== "category" && filterState.categories.length > 0) {
      if (!filterState.categories.includes(p.category.slug)) return false;
    }

    // Price min
    if (filterState.price.minCents !== null && p.startingPriceCents < filterState.price.minCents) {
      return false;
    }

    // Price max
    if (filterState.price.maxCents !== null && p.startingPriceCents > filterState.price.maxCents) {
      return false;
    }

    // Technical specifications filter
    if (schema && Object.keys(filterState.technical).length > 0) {
      for (const [key, filterVal] of Object.entries(filterState.technical)) {
        const prodVal = p.specValues[key];
        if (prodVal === undefined || prodVal === null) return false;

        if (Array.isArray(filterVal)) {
          // ENUM_MULTI: OR
          if (!filterVal.includes(String(prodVal))) return false;
        } else if (typeof filterVal === "object" && filterVal !== null) {
          // NUMBER_RANGE
          const range = filterVal;
          const numVal = Number(prodVal);

          if (Number.isNaN(numVal)) return false;
          if (range.min !== undefined && numVal < range.min) return false;
          if (range.max !== undefined && numVal > range.max) return false;
        } else if (typeof filterVal === "boolean") {
          // BOOLEAN
          if (prodVal !== true) return false;
        }
      }
    }

    return true;
  });

  // Sorting
  const sort = filterState.sort;
  if (sort === "precio-menor") {
    filtered.sort(
      (a, b) => a.startingPriceCents - b.startingPriceCents || a.id.localeCompare(b.id)
    );
  } else if (sort === "precio-mayor") {
    filtered.sort(
      (a, b) => b.startingPriceCents - a.startingPriceCents || a.id.localeCompare(b.id)
    );
  } else if (sort === "nombre-asc") {
    filtered.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  } else if (sort === "nombre-desc") {
    filtered.sort((a, b) => b.name.localeCompare(a.name) || a.id.localeCompare(b.id));
  } else if (sort === "recientes" || surface !== "search") {
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  return filtered;
}

export const SYNTHETIC_DEFAULT_PRODUCTS: SyntheticProductWithSpecs[] = [
  ...generateSyntheticProducts("mouses", "Mouses Gaming", 14),
  ...generateSyntheticProducts("teclados", "Teclados Gaming", 4),
  ...generateSyntheticProducts("mousepads", "Mousepads Gaming", 4),
  ...generateSyntheticProducts("audio", "Audio Gaming", 4),
  ...generateSyntheticProducts("accesorios", "Accesorios Gaming", 4),
];

export function buildSyntheticProductDetail(
  slug: string,
  allProducts: SyntheticProductWithSpecs[] = SYNTHETIC_DEFAULT_PRODUCTS
): ProductDetailEntity | null {
  // Test special-cases for defensive testing
  if (slug === "producto-draft" || slug === "producto-sin-variantes") {
    return null;
  }
  if (slug === "producto-marca-draft") {
    return null;
  }
  if (slug === "producto-categoria-draft") {
    return null;
  }

  const p = allProducts.find((item) => item.slug === slug);
  if (!p) return null;

  const category =
    SYNTHETIC_CATEGORIES[p.category.slug] ?? SYNTHETIC_TEST_CATEGORIES[p.category.slug];
  if (!category || category.status !== "PUBLISHED") {
    return null;
  }

  const brand =
    SYNTHETIC_NAV_BRANDS[p.brand.slug] ??
    SYNTHETIC_TEST_BRANDS[p.brand.slug] ??
    (p.brand.slug === SYNTHETIC_QA_BRAND.slug ? SYNTHETIC_QA_BRAND : null);
  if (!brand || brand.status !== "PUBLISHED") {
    return null;
  }

  const variant1Id = `${p.id}-v01`;
  const variant2Id = `${p.id}-v02`;

  const variants: ProductVariantDetail[] = [
    {
      id: variant1Id,
      productId: p.id,
      sku: `SKU-${p.slug.toUpperCase()}-BLK`,
      title: "Negro Mate / 8K",
      priceCents: p.startingPriceCents,
      compareAtPriceCents: p.startingPriceCents + 3000,
      costCents: Math.round(p.startingPriceCents * 0.6),
      weightGrams: typeof p.specValues.weight_g === "number" ? p.specValues.weight_g : 49,
      displayOrder: 1,
      status: "ACTIVE",
      attributes: {
        color: "Negro",
        edicion: "Standard",
      },
    },
    {
      id: variant2Id,
      productId: p.id,
      sku: `SKU-${p.slug.toUpperCase()}-WHT`,
      title: "Blanco Glaciar / 8K",
      priceCents: p.startingPriceCents + 1000,
      compareAtPriceCents: p.startingPriceCents + 4000,
      costCents: Math.round((p.startingPriceCents + 1000) * 0.6),
      weightGrams: typeof p.specValues.weight_g === "number" ? p.specValues.weight_g : 49,
      displayOrder: 2,
      status: "ACTIVE",
      attributes: {
        color: "Blanco",
        edicion: "Especial",
      },
    },
  ];

  const media: ProductMediaItem[] = [
    {
      id: `${p.id}-m01`,
      productId: p.id,
      mediaAssetId: `${p.id}-a01`,
      variantId: null, // Global
      displayOrder: 1,
      asset: {
        objectKey: `products/${p.slug}/hero.png`,
        mimeType: "image/png",
        fileSizeBytes: 204800,
        width: 1200,
        height: 1200,
        altText: `${p.name} Vista Frontal`,
      },
    },
    {
      id: `${p.id}-m02`,
      productId: p.id,
      mediaAssetId: `${p.id}-a02`,
      variantId: variant1Id, // Variant specific
      displayOrder: 2,
      asset: {
        objectKey: `products/${p.slug}/variant-black.png`,
        mimeType: "image/png",
        fileSizeBytes: 184320,
        width: 1200,
        height: 1200,
        altText: `${p.name} Negro`,
      },
    },
    {
      id: `${p.id}-m03`,
      productId: p.id,
      mediaAssetId: `${p.id}-a03`,
      variantId: variant2Id, // Variant specific
      displayOrder: 3,
      asset: {
        objectKey: `products/${p.slug}/variant-white.png`,
        mimeType: "image/png",
        fileSizeBytes: 194560,
        width: 1200,
        height: 1200,
        altText: `${p.name} Blanco`,
      },
    },
  ];

  const schema = SYNTHETIC_SPEC_SCHEMAS[p.category.slug];
  const specifications: ProductSpecificationDetail | null = schema
    ? {
        id: p.id,
        productId: p.id,
        schemaId: schema.id,
        schemaVersion: schema.schemaVersion,
        specValues: p.specValues,
        schema,
      }
    : null;

  const story: ProductStoryDetail = {
    productId: p.id,
    publishedRevisionId: `${p.id}-r01`,
    revisionNumber: 1,
    publishedAt: new Date(1700000000000).toISOString(),
    blocks: [
      {
        block_id: `${p.id}-b01`,
        type: "hero",
        order: 1,
        payload: {
          headline: `Ingeniería de Precisión: ${p.name}`,
          tagline: "Desarrollado para la máxima consistencia en esports competitivos.",
          mediaKey: `stories/${p.slug}/story-hero.png`,
        },
      },
      {
        block_id: `${p.id}-b02`,
        type: "features_grid",
        order: 2,
        payload: {
          items: [
            {
              title: "Sensor Flagship",
              description: "Precisión 1:1 sin suavizado artificial.",
            },
            {
              title: "Estructura Ultraligera",
              description: "Chasis reforzado con balance de peso centralizado.",
            },
          ],
        },
      },
    ],
  };

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    subtitle: p.subtitle,
    description: `Descripción completa de ingeniería y rendimiento para ${p.name}.`,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
    brand: {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      logo: brand.logo,
    },
    category: {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
    },
    primaryMedia: media[0] ?? null,
    variants,
    media,
    specifications,
    story,
  };
}
