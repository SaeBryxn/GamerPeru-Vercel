import "server-only";
import {
  generateSyntheticProducts,
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_QA_BRAND,
} from "@/lib/catalog/synthetic-catalog-data";
import type { PaginatedResult, ProductDiscoveryItem } from "@/lib/catalog/types";
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

export function getAllSyntheticProducts(): ProductDiscoveryItem[] {
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
  const subtitle = (product.subtitle ?? "").toLowerCase();
  const brandName = product.brand.name.toLowerCase();
  const brandSlug = product.brand.slug.toLowerCase();
  const catName = product.category.name.toLowerCase();
  const catSlug = product.category.slug.toLowerCase();

  if (name === q) return 1000;
  if (slug === q) return 900;
  if (name.startsWith(q)) return 800;
  if (name.includes(q)) return 600;
  if (brandName === q || brandSlug === q) return 300;
  if (brandName.includes(q)) return 250;
  if (catName === q || catSlug === q) return 200;
  if (catName.includes(q)) return 150;
  if (subtitle.includes(q)) return 100;

  return 0;
}

export function scoreSyntheticBrand(brand: SearchBrandSuggestion, cleanQuery: string): number {
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
  category: SearchCategorySuggestion,
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

export function executeSyntheticSearch(query: string) {
  const cleanQuery = normalizeSearchQuery(query);
  if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
    return {
      products: [],
      brands: [],
      categories: [],
    };
  }

  const scoredProducts = getAllSyntheticProducts()
    .map((p) => ({ product: p, score: scoreSyntheticProduct(p, cleanQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.product.id.localeCompare(a.product.id))
    .map((entry) => entry.product);

  const scoredBrands = getAllSyntheticBrands()
    .map((b) => ({ brand: b, score: scoreSyntheticBrand(b, cleanQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.brand.name.localeCompare(b.brand.name))
    .map((entry) => entry.brand);

  const scoredCategories = getAllSyntheticCategories()
    .map((c) => ({ category: c, score: scoreSyntheticCategory(c, cleanQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name))
    .map((entry) => entry.category);

  return {
    products: scoredProducts,
    brands: scoredBrands,
    categories: scoredCategories,
  };
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

export async function searchSyntheticProducts(
  query: string,
  pagination: SearchPagination
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

  const { products } = executeSyntheticSearch(cleanQuery);
  const totalItems = products.length;
  const totalPages = Math.ceil(totalItems / safePageSize);
  const offset = (safePage - 1) * safePageSize;
  const items = products.slice(offset, offset + safePageSize);

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
