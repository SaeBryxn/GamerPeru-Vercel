import "server-only";
import type {
  CategoryFacetOption,
  DiscoveryFacets,
  DiscoveryFilterState,
  SpecificationEnumOption,
  TechnicalFacet,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

import type { CatalogDiscoveryReader } from "./reader";
import type { ProductDetailReader } from "./product-detail-reader";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_QA_BRAND,
  SYNTHETIC_SPEC_SCHEMAS,
  SYNTHETIC_TEST_BRANDS,
  SYNTHETIC_TEST_CATEGORIES,
  buildSyntheticProductDetail,
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
  ProductDetailEntity,
} from "./types";

const ALL_FIXTURE_CATEGORIES: Record<string, SyntheticCategoryEntry> = {
  ...SYNTHETIC_CATEGORIES,
  ...SYNTHETIC_TEST_CATEGORIES,
};

const ALL_FIXTURE_BRANDS: Record<string, SyntheticBrandEntry> = {
  "marca-qa": SYNTHETIC_QA_BRAND,
  ...SYNTHETIC_NAV_BRANDS,
  ...SYNTHETIC_TEST_BRANDS,
};

const FIXTURE_PRODUCTS: SyntheticProductWithSpecs[] = [
  ...generateSyntheticProducts("mouses", "Mouses Gaming", 14),
  ...generateSyntheticProducts("teclados", "Teclados Gaming", 4),
  ...generateSyntheticProducts("mousepads", "Mousepads Gaming", 4),
  ...generateSyntheticProducts("audio", "Audio Gaming", 4),
  ...generateSyntheticProducts("accesorios", "Accesorios Gaming", 4),
];

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
      let hasTrue = false;
      for (const p of products) {
        const val = p.specValues[field.key];
        if (val === true) {
          hasTrue = true;
          break;
        }
      }

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

export class FixtureCatalogDiscoveryReader implements CatalogDiscoveryReader, ProductDetailReader {
  async getPublishedProductBySlug(slug: string): Promise<ProductDetailEntity | null> {
    return buildSyntheticProductDetail(slug, FIXTURE_PRODUCTS);
  }

  async getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null> {
    const item = ALL_FIXTURE_CATEGORIES[slug];
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
    const item = ALL_FIXTURE_BRANDS[slug];
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

  async getCategorySpecificationSchema(
    categoryId: string
  ): Promise<ValidatedSpecificationSchema | null> {
    const category = Object.values(ALL_FIXTURE_CATEGORIES).find((c) => c.id === categoryId);
    if (!category) return null;
    return SYNTHETIC_SPEC_SCHEMAS[category.slug] ?? null;
  }

  async getCategoryDiscoveryFacets(
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    const targetCategory = Object.values(ALL_FIXTURE_CATEGORIES).find((c) => c.id === categoryId);
    if (!targetCategory) {
      return { brands: [], categories: [], technicalSchema: null, technicalFacets: [] };
    }

    const baseProducts = FIXTURE_PRODUCTS.filter((p) => p.category.slug === targetCategory.slug);
    const representedBrandSlugs = new Set(baseProducts.map((p) => p.brand.slug));
    const brandOptions = Object.values(ALL_FIXTURE_BRANDS)
      .filter((b) => b.status === "PUBLISHED" && representedBrandSlugs.has(b.slug))
      .map((b) => ({ id: b.id, name: b.name, slug: b.slug }));

    const resolvedSchema = schema ?? SYNTHETIC_SPEC_SCHEMAS[targetCategory.slug] ?? null;
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

  async getBrandCategoryFacetOptions(brandId: string): Promise<CategoryFacetOption[]> {
    const targetBrand = Object.values(ALL_FIXTURE_BRANDS).find((b) => b.id === brandId);
    if (!targetBrand) return [];

    const baseProducts = FIXTURE_PRODUCTS.filter((p) => p.brand.slug === targetBrand.slug);
    const representedCategorySlugs = new Set(baseProducts.map((p) => p.category.slug));
    return Object.values(ALL_FIXTURE_CATEGORIES)
      .filter((c) => c.status === "PUBLISHED" && representedCategorySlugs.has(c.slug))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  }

  async getBrandDiscoveryFacets(
    brandId: string,
    baseCategories: CategoryFacetOption[],
    selectedCategoryId: string | null,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets> {
    const targetBrand = Object.values(ALL_FIXTURE_BRANDS).find((b) => b.id === brandId);
    if (!targetBrand) {
      return { brands: [], categories: [], technicalSchema: null, technicalFacets: [] };
    }

    const baseProducts = FIXTURE_PRODUCTS.filter((p) => p.brand.slug === targetBrand.slug);
    let techFacets: TechnicalFacet[] = [];

    if (selectedCategoryId && schema) {
      const selectedCat = Object.values(ALL_FIXTURE_CATEGORIES).find(
        (c) => c.id === selectedCategoryId
      );
      const catProducts = selectedCat
        ? baseProducts.filter((p) => p.category.slug === selectedCat.slug)
        : [];
      techFacets = deriveSyntheticTechnicalFacets(schema, catProducts);
      return {
        brands: [],
        categories: baseCategories,
        technicalSchema: schema,
        technicalFacets: techFacets,
      };
    }

    return {
      brands: [],
      categories: baseCategories,
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  async getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const category = Object.values(ALL_FIXTURE_CATEGORIES).find((c) => c.id === categoryId);
    if (!category) {
      return { items: [], totalItems: 0, page: 1, pageSize: pagination.pageSize, totalPages: 0 };
    }

    const baseProducts = FIXTURE_PRODUCTS.filter((p) => p.category.slug === category.slug);
    const resolvedSchema = schema ?? SYNTHETIC_SPEC_SCHEMAS[category.slug] ?? null;

    const filtered = filterAndSortSyntheticProducts(
      baseProducts,
      filterState,
      "category",
      resolvedSchema
    );

    const safePage = Math.max(1, Math.trunc(pagination.page));
    const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / safePageSize);
    const offset = (safePage - 1) * safePageSize;
    const items = filtered.slice(offset, offset + safePageSize).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle,
      brand: p.brand,
      category: p.category,
      primaryMedia: p.primaryMedia,
      startingPriceCents: p.startingPriceCents,
    }));

    return {
      items,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>> {
    const brand = Object.values(ALL_FIXTURE_BRANDS).find((b) => b.id === brandId);
    if (!brand) {
      return { items: [], totalItems: 0, page: 1, pageSize: pagination.pageSize, totalPages: 0 };
    }

    const baseProducts = FIXTURE_PRODUCTS.filter((p) => p.brand.slug === brand.slug);

    const filtered = filterAndSortSyntheticProducts(
      baseProducts,
      filterState,
      "brand",
      schema ?? null
    );

    const safePage = Math.max(1, Math.trunc(pagination.page));
    const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / safePageSize);
    const offset = (safePage - 1) * safePageSize;
    const items = filtered.slice(offset, offset + safePageSize).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle,
      brand: p.brand,
      category: p.category,
      primaryMedia: p.primaryMedia,
      startingPriceCents: p.startingPriceCents,
    }));

    return {
      items,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }
}
