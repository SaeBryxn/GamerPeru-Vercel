import "server-only";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_QA_BRAND,
  filterAndSortSyntheticProducts,
  generateSyntheticProducts,
  type SyntheticProductWithSpecs,
} from "@/lib/catalog/synthetic-catalog-data";
import type {
  BrandFacetOption,
  CategoryFacetOption,
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  ProductDiscoveryItem,
  SpecificationEnumOption,
  TechnicalFacet,
  ValidatedSpecificationSchema,
} from "@/lib/catalog/types";

import { getQueryCodePointLength, normalizeSearchQuery } from "./normalization";
import {
  MIN_SEARCH_QUERY_LENGTH,
  type SearchBrandSuggestion,
  type SearchCategorySuggestion,
  type SearchEntityMatches,
  type SearchPagination,
  type SearchProductSuggestion,
  type SearchSuggestionsResult,
} from "./types";

export function getAllSyntheticProducts(): SyntheticProductWithSpecs[] {
  const mouses = generateSyntheticProducts("mouses", "Mouses Gaming", 12, 1);
  const teclados = generateSyntheticProducts("teclados", "Teclados Gaming", 4, 1);
  const mousepads = generateSyntheticProducts("mousepads", "Mousepads Gaming", 4, 1);
  const audio = generateSyntheticProducts("audio", "Audio Gaming", 4, 1);
  const accesorios = generateSyntheticProducts("accesorios", "Accesorios Gaming", 4, 1);

  return [...mouses, ...teclados, ...mousepads, ...audio, ...accesorios];
}

export function getAllSyntheticBrands(): SearchBrandSuggestion[] {
  const list = Object.values(SYNTHETIC_NAV_BRANDS)
    .filter((b) => b.status === "PUBLISHED")
    .map((b) => ({ name: b.name, slug: b.slug }));

  list.push({ name: SYNTHETIC_QA_BRAND.name, slug: SYNTHETIC_QA_BRAND.slug });
  return list;
}

export function getAllSyntheticCategories(): SearchCategorySuggestion[] {
  return Object.values(SYNTHETIC_CATEGORIES)
    .filter((c) => c.status === "PUBLISHED")
    .map((c) => ({ name: c.name, slug: c.slug }));
}

export function scoreSyntheticProduct(product: ProductDiscoveryItem, cleanQuery: string): number {
  const q = cleanQuery.toLowerCase();
  const name = product.name.toLowerCase();
  const slug = product.slug.toLowerCase();
  const brandName = product.brand.name.toLowerCase();
  const brandSlug = product.brand.slug.toLowerCase();
  const categoryName = product.category.name.toLowerCase();
  const categorySlug = product.category.slug.toLowerCase();
  const subtitle = (product.subtitle ?? "").toLowerCase();

  if (name === q) return 1000;
  if (slug === q) return 900;
  if (name.startsWith(q)) return 800;
  if (name.includes(q)) return 600;
  if (brandName === q || brandSlug === q) return 300;
  if (brandName.includes(q) || brandSlug.includes(q)) return 250;
  if (categoryName === q || categorySlug === q) return 200;
  if (categoryName.includes(q) || categorySlug.includes(q)) return 150;
  if (subtitle.includes(q)) return 100;
  return 0;
}

export function scoreSyntheticBrand(
  brand: { name: string; slug: string },
  cleanQuery: string
): number {
  const q = cleanQuery.toLowerCase();
  const name = brand.name.toLowerCase();
  const slug = brand.slug.toLowerCase();
  if (name === q) return 100;
  if (slug === q) return 90;
  if (name.startsWith(q)) return 80;
  if (name.includes(q) || slug.includes(q)) return 50;
  return 0;
}

export function scoreSyntheticCategory(
  category: { name: string; slug: string },
  cleanQuery: string
): number {
  const q = cleanQuery.toLowerCase();
  const name = category.name.toLowerCase();
  const slug = category.slug.toLowerCase();
  if (name === q) return 100;
  if (slug === q) return 90;
  if (name.startsWith(q)) return 80;
  if (name.includes(q) || slug.includes(q)) return 50;
  return 0;
}

export function executeSyntheticSearch(cleanQuery: string) {
  const allProducts = getAllSyntheticProducts();
  const allBrands = getAllSyntheticBrands();
  const allCategories = getAllSyntheticCategories();

  const matchingProducts: Array<{ product: SyntheticProductWithSpecs; score: number }> = [];
  for (const p of allProducts) {
    const score = scoreSyntheticProduct(p, cleanQuery);
    if (score > 0) {
      matchingProducts.push({ product: p, score });
    }
  }

  matchingProducts.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.product.name.localeCompare(b.product.name);
  });

  const matchingBrands: Array<{ brand: SearchBrandSuggestion; score: number }> = [];
  for (const b of allBrands) {
    const score = scoreSyntheticBrand(b, cleanQuery);
    if (score > 0) {
      matchingBrands.push({ brand: b, score });
    }
  }
  matchingBrands.sort((a, b) => b.score - a.score || a.brand.name.localeCompare(b.brand.name));

  const matchingCategories: Array<{ category: SearchCategorySuggestion; score: number }> = [];
  for (const c of allCategories) {
    const score = scoreSyntheticCategory(c, cleanQuery);
    if (score > 0) {
      matchingCategories.push({ category: c, score });
    }
  }
  matchingCategories.sort(
    (a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name)
  );

  return {
    products: matchingProducts.map((m) => m.product),
    brands: matchingBrands.map((m) => m.brand),
    categories: matchingCategories.map((m) => m.category),
  };
}

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

export async function getSyntheticSuggestions(query: string): Promise<SearchSuggestionsResult> {
  const { products, brands, categories } = executeSyntheticSearch(query);

  const productSuggestions: SearchProductSuggestion[] = products.slice(0, 6).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    subtitle: p.subtitle,
    brand: p.brand,
    startingPriceCents: p.startingPriceCents,
    primaryMedia: p.primaryMedia,
  }));

  return {
    products: productSuggestions,
    brands: brands.slice(0, 3),
    categories: categories.slice(0, 3),
  };
}

export async function getSyntheticSearchBaseFacetOptions(query: string): Promise<{
  brands: BrandFacetOption[];
  categories: CategoryFacetOption[];
}> {
  const cleanQuery = normalizeSearchQuery(query);
  if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
    return { brands: [], categories: [] };
  }

  const { products } = executeSyntheticSearch(cleanQuery);
  const representedBrandSlugs = new Set(products.map((p) => p.brand.slug));
  const representedCategorySlugs = new Set(products.map((p) => p.category.slug));

  const brandOptions = Object.values(SYNTHETIC_NAV_BRANDS)
    .filter((b) => b.status === "PUBLISHED" && representedBrandSlugs.has(b.slug))
    .map((b) => ({ id: b.id, name: b.name, slug: b.slug }));

  if (representedBrandSlugs.has(SYNTHETIC_QA_BRAND.slug)) {
    brandOptions.push({
      id: SYNTHETIC_QA_BRAND.id,
      name: SYNTHETIC_QA_BRAND.name,
      slug: SYNTHETIC_QA_BRAND.slug,
    });
  }

  const categoryOptions = Object.values(SYNTHETIC_CATEGORIES)
    .filter((c) => c.status === "PUBLISHED" && representedCategorySlugs.has(c.slug))
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  return {
    brands: brandOptions,
    categories: categoryOptions,
  };
}

export async function getSyntheticSearchDiscoveryFacets(
  query: string,
  baseBrands: BrandFacetOption[],
  baseCategories: CategoryFacetOption[],
  selectedCategoryId: string | null,
  schema: ValidatedSpecificationSchema | null
): Promise<DiscoveryFacets> {
  const cleanQuery = normalizeSearchQuery(query);
  if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
    return {
      brands: [],
      categories: [],
      technicalSchema: null,
      technicalFacets: [],
    };
  }

  let techFacets: TechnicalFacet[] = [];

  if (selectedCategoryId && schema) {
    const { products } = executeSyntheticSearch(cleanQuery);
    const selectedCat = Object.values(SYNTHETIC_CATEGORIES).find(
      (c) => c.id === selectedCategoryId
    );
    const catProducts = selectedCat
      ? products.filter((p) => p.category.slug === selectedCat.slug)
      : [];
    techFacets = deriveSyntheticTechnicalFacets(schema, catProducts);
    return {
      brands: baseBrands,
      categories: baseCategories,
      technicalSchema: schema,
      technicalFacets: techFacets,
    };
  }

  return {
    brands: baseBrands,
    categories: baseCategories,
    technicalSchema: null,
    technicalFacets: [],
  };
}

export async function searchSyntheticProducts(
  query: string,
  pagination: SearchPagination,
  filterState?: DiscoveryFilterState,
  schema?: ValidatedSpecificationSchema | null
): Promise<PaginatedResult<ProductDiscoveryItem>> {
  const cleanQuery = normalizeSearchQuery(query);
  const safePage = Math.max(1, Math.trunc(pagination.page));
  const safePageSize = Math.max(1, Math.trunc(pagination.pageSize));

  if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
    return {
      items: [],
      totalItems: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 0,
    };
  }

  const { products: candidateProducts } = executeSyntheticSearch(cleanQuery);

  const filtered = filterAndSortSyntheticProducts(
    candidateProducts,
    filterState,
    "search",
    schema ?? null
  );

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / safePageSize);
  const offset = (safePage - 1) * safePageSize;
  const items = filtered.slice(offset, offset + safePageSize);

  return {
    items,
    totalItems,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function searchSyntheticMatchingEntities(query: string): Promise<SearchEntityMatches> {
  const { brands, categories } = executeSyntheticSearch(query);

  return {
    brands: brands.slice(0, 4),
    categories: categories.slice(0, 4),
  };
}
