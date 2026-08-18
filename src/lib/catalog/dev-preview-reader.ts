import "server-only";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  SpecificationEnumOption,
  TechnicalFacet,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

import type { CatalogDiscoveryReader } from "./reader";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_QA_BRAND,
  SYNTHETIC_SPEC_SCHEMAS,
  filterAndSortSyntheticProducts,
  generateSyntheticProducts,
  type SyntheticBrandEntry,
  type SyntheticCategoryEntry,
  type SyntheticProductWithSpecs,
} from "./synthetic-catalog-data";

import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";

const PREVIEW_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
  ...SYNTHETIC_CATEGORIES,
};

const PREVIEW_BRANDS: Record<string, SyntheticBrandEntry> = {
  "marca-qa": SYNTHETIC_QA_BRAND,
  ...SYNTHETIC_NAV_BRANDS,
};

const PREVIEW_PRODUCTS_BY_CATEGORY: Record<string, SyntheticProductWithSpecs[]> = {
  mouses: generateSyntheticProducts("mouses", "Mouses Gaming", 14),
  teclados: generateSyntheticProducts("teclados", "Teclados Gaming", 4),
  mousepads: generateSyntheticProducts("mousepads", "Mousepads Gaming", 4),
  audio: generateSyntheticProducts("audio", "Audio Gaming", 4),
  accesorios: generateSyntheticProducts("accesorios", "Accesorios Gaming", 4),
};

const ALL_PREVIEW_PRODUCTS: SyntheticProductWithSpecs[] = Object.values(
  PREVIEW_PRODUCTS_BY_CATEGORY
).flat();

function deriveSyntheticTechnicalFacets(
  schema: ValidatedSpecificationSchema,
  products: SyntheticProductWithSpecs[]
): TechnicalFacet[] {
  const facets: TechnicalFacet[] = [];

  for (const field of schema.fieldDefinitions) {
    if (!field.filterable) continue;

    if (field.filterKind === "ENUM_MULTI") {
      const representedValues = new Set<string>();
      for (const p of products) {
        const val = p.specValues[field.key];
        if (typeof val === "string") {
          representedValues.add(val);
        }
      }

      const representedOptions: SpecificationEnumOption[] = (field.options ?? []).filter((opt) =>
        representedValues.has(opt.value)
      );

      if (representedOptions.length > 0) {
        facets.push({
          field,
          kind: "ENUM_MULTI",
          representedOptions,
        });
      }
    } else if (field.filterKind === "NUMBER_RANGE") {
      let minObserved: number | null = null;
      let maxObserved: number | null = null;

      for (const p of products) {
        const val = p.specValues[field.key];
        if (typeof val === "number" && Number.isFinite(val)) {
          if (minObserved === null || val < minObserved) minObserved = val;
          if (maxObserved === null || val > maxObserved) maxObserved = val;
        }
      }

      if (minObserved !== null && maxObserved !== null) {
        facets.push({
          field,
          kind: "NUMBER_RANGE",
          minRepresented: minObserved,
          maxRepresented: maxObserved,
        });
      }
    } else if (field.filterKind === "BOOLEAN") {
      const hasTrue = products.some((p) => p.specValues[field.key] === true);
      if (hasTrue) {
        facets.push({
          field,
          kind: "BOOLEAN",
          hasRepresentedTrue: true,
        });
      }
    }
  }

  return facets;
}

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

  async getCategorySpecificationSchema(
    categoryId: string
  ): Promise<ValidatedSpecificationSchema | null> {
    const category = Object.values(PREVIEW_CATEGORIES).find((c) => c.id === categoryId);
    if (!category) return null;
    return SYNTHETIC_SPEC_SCHEMAS[category.slug] ?? null;
  }

  async getCategoryDiscoveryFacets(
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    const category = Object.values(PREVIEW_CATEGORIES).find((c) => c.id === categoryId);
    if (!category) {
      return { brands: [], categories: [], technicalSchema: null, technicalFacets: [] };
    }

    const baseProducts = PREVIEW_PRODUCTS_BY_CATEGORY[category.slug] ?? [];
    const representedBrandSlugs = new Set(baseProducts.map((p) => p.brand.slug));
    const brandOptions = Object.values(PREVIEW_BRANDS)
      .filter((b) => b.status === "PUBLISHED" && representedBrandSlugs.has(b.slug))
      .map((b) => ({ id: b.id, name: b.name, slug: b.slug }));

    const resolvedSchema = schema ?? SYNTHETIC_SPEC_SCHEMAS[category.slug] ?? null;
    const techFacets = resolvedSchema
      ? deriveSyntheticTechnicalFacets(resolvedSchema, baseProducts)
      : [];

    return {
      brands: brandOptions,
      categories: [],
      technicalSchema: resolvedSchema,
      technicalFacets: techFacets,
    };
  }

  async getBrandDiscoveryFacets(
    brandId: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets> {
    const brand = Object.values(PREVIEW_BRANDS).find((b) => b.id === brandId);
    if (!brand) {
      return { brands: [], categories: [], technicalSchema: null, technicalFacets: [] };
    }

    const baseProducts = ALL_PREVIEW_PRODUCTS.filter((p) => p.brand.slug === brand.slug);
    const representedCategorySlugs = new Set(baseProducts.map((p) => p.category.slug));
    const categoryOptions = Object.values(PREVIEW_CATEGORIES)
      .filter((c) => c.status === "PUBLISHED" && representedCategorySlugs.has(c.slug))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

    let techFacets: TechnicalFacet[] = [];
    let techSchema: ValidatedSpecificationSchema | null = null;

    if (selectedCategorySlug) {
      techSchema = SYNTHETIC_SPEC_SCHEMAS[selectedCategorySlug] ?? null;
      if (techSchema) {
        const catProducts = baseProducts.filter((p) => p.category.slug === selectedCategorySlug);
        techFacets = deriveSyntheticTechnicalFacets(techSchema, catProducts);
      }
    }

    return {
      brands: [],
      categories: categoryOptions,
      technicalSchema: techSchema,
      technicalFacets: techFacets,
    };
  }

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const category = Object.values(PREVIEW_CATEGORIES).find(
      (c) => c.id === categoryId && c.status === "PUBLISHED"
    );

    if (!category) {
      return emptyPage(pagination);
    }

    const baseProducts = PREVIEW_PRODUCTS_BY_CATEGORY[category.slug] ?? [];
    const resolvedSchema = schema ?? SYNTHETIC_SPEC_SCHEMAS[category.slug] ?? null;
    const filtered = filterAndSortSyntheticProducts(
      baseProducts,
      filterState,
      "category",
      resolvedSchema
    );

    return paginate(filtered, pagination);
  }

  async getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const brand = Object.values(PREVIEW_BRANDS).find(
      (b) => b.id === brandId && b.status === "PUBLISHED"
    );

    if (!brand) {
      return emptyPage(pagination);
    }

    const baseProducts = ALL_PREVIEW_PRODUCTS.filter((p) => p.brand.slug === brand.slug);
    const filtered = filterAndSortSyntheticProducts(
      baseProducts,
      filterState,
      "brand",
      schema ?? null
    );

    return paginate(filtered, pagination);
  }
}

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
