import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import type {
  MegaMenuCategory,
  MegaMenuSection,
  NavigationConfig,
  NavLink,
} from "@/components/navigation/types";
import { getMenuEntrySettings, type MenuEntrySetting } from "./menu-settings";
import {
  buildBrandColumns,
  buildMenuShelves,
  buildProductTiles,
  buildPromoCards,
  getMenuCatalogEntries,
} from "./menu-catalog";

export interface CategoryCatalogFacts {
  categorySlug: string;
  publishedProducts: number;
  brands: NavLink[];
}

export interface CatalogNavigationFacts {
  byCategory: Map<string, CategoryCatalogFacts>;
  /** Every published brand, used wherever a category has nothing published yet. */
  allBrands: NavLink[];
}

/**
 * Published catalog state behind the navigation.
 *
 * Fail-soft: a database problem must not take the navigation down with it, so callers fall back
 * to the declared configuration.
 */
export async function getCatalogNavigationFacts(): Promise<CatalogNavigationFacts> {
  const byCategory = new Map<string, CategoryCatalogFacts>();
  const allBrands: NavLink[] = [];

  try {
    const [rows, publishedBrands] = await Promise.all([
      db
        .select({
          categorySlug: categories.slug,
          brandName: brands.name,
          brandSlug: brands.slug,
          productCount: sql<number>`count(*)::int`,
        })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .innerJoin(brands, eq(brands.id, products.brandId))
        .where(and(eq(products.status, "PUBLISHED"), eq(brands.status, "PUBLISHED")))
        .groupBy(categories.slug, brands.name, brands.slug),
      db
        .select({ name: brands.name, slug: brands.slug })
        .from(brands)
        .where(eq(brands.status, "PUBLISHED"))
        .orderBy(brands.name),
    ]);

    for (const row of rows) {
      const existing = byCategory.get(row.categorySlug) ?? {
        categorySlug: row.categorySlug,
        publishedProducts: 0,
        brands: [],
      };
      existing.publishedProducts += Number(row.productCount);
      existing.brands.push({ label: row.brandName, href: `/marcas/${row.brandSlug}` });
      byCategory.set(row.categorySlug, existing);
    }

    for (const entry of byCategory.values()) {
      entry.brands.sort((a, b) => a.label.localeCompare(b.label));
    }

    allBrands.push(...publishedBrands.map((b) => ({ label: b.name, href: `/marcas/${b.slug}` })));
  } catch {
    return { byCategory, allBrands };
  }

  return { byCategory, allBrands };
}

/** Kept for callers that only need per-category facts. */
export async function getCategoryCatalogFacts(): Promise<Map<string, CategoryCatalogFacts>> {
  return (await getCatalogNavigationFacts()).byCategory;
}

function buildHiddenMatcher(settings: MenuEntrySetting[]): (href: string) => boolean {
  const hiddenPaths = settings
    .filter((entry) => !entry.isVisible && entry.categorySlug)
    .map((entry) => `/categorias/${entry.categorySlug as string}`);

  return (href: string) => hiddenPaths.some((path) => href === path || href.startsWith(`${path}?`));
}

function filterSections(
  sections: MegaMenuSection[] | undefined,
  isHidden: (href: string) => boolean
): MegaMenuSection[] {
  if (!sections) return [];
  return sections
    .map((section) => ({ ...section, items: section.items.filter((i) => !isHidden(i.href)) }))
    .filter((section) => section.items.length > 0);
}

/**
 * Builds the storefront navigation from configuration plus live catalog state.
 *
 * Three things are resolved here rather than hardcoded:
 * 1. Which top-level entries the operator currently shows, and in what order.
 * 2. Brand lists, which must name brands that exist in the catalog; a declared brand without a
 *    page renders a link straight into a 404 and implies a relationship the store does not have.
 * 3. Links pointing at a hidden category, wherever they appear, so hiding a section removes it
 *    from every menu, tile and footer column at once.
 */
export async function getStorefrontNavigation(): Promise<NavigationConfig> {
  const [settings, facts, catalogEntries] = await Promise.all([
    getMenuEntrySettings(),
    getCatalogNavigationFacts(),
    getMenuCatalogEntries(),
  ]);

  const isHidden = buildHiddenMatcher(settings);
  // Sorted here rather than trusting the caller, so the rendered order never depends on how the
  // settings happened to come back from storage.
  const visible = settings
    .filter((entry) => entry.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.adminLabel.localeCompare(b.adminLabel));
  const orderById = new Map(visible.map((entry, index) => [entry.id, index]));
  const settingById = new Map<string, MenuEntrySetting>(settings.map((entry) => [entry.id, entry]));

  const resolveBrands = (categorySlug: string | undefined): NavLink[] | undefined => {
    const scoped = categorySlug ? facts.byCategory.get(categorySlug)?.brands : undefined;
    if (scoped && scoped.length > 0) return scoped;
    return facts.allBrands.length > 0 ? facts.allBrands : undefined;
  };

  const primaryNav: MegaMenuCategory[] = NAVIGATION_CONFIG.primaryNav
    .filter((item) => orderById.has(item.id))
    .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))
    .map((item) => {
      const categorySlug = settingById.get(item.id)?.categorySlug;
      const resolved: MegaMenuCategory = {
        ...item,
        sections: filterSections(item.sections, isHidden),
      };

      // Declared series and promo cards described product lines the store does not carry. Where the
      // catalog can answer, it replaces them with real brands and real products; where it cannot,
      // the block is dropped rather than shipping placeholder names and a stock photo.
      if (item.series) {
        const brandColumns = categorySlug ? buildBrandColumns(catalogEntries, categorySlug) : [];
        if (brandColumns.length > 0) resolved.series = brandColumns;
        else delete resolved.series;
      }

      if (item.promos) {
        const promoCards = categorySlug ? buildPromoCards(catalogEntries, categorySlug) : [];
        if (promoCards.length > 0) resolved.promos = promoCards;
        else delete resolved.promos;
      }

      // Tiles are showcase art for a category's filters until that category has published
      // products of its own; then the real photos take over.
      if (item.tiles) {
        const productTiles = categorySlug ? buildProductTiles(catalogEntries, categorySlug) : [];
        resolved.tiles =
          productTiles.length > 0 ? productTiles : item.tiles.filter((t) => !isHidden(t.href));
      }
      if (item.previews) resolved.previews = item.previews.filter((p) => !isHidden(p.href));

      if (item.brands) {
        const liveBrands = resolveBrands(categorySlug);
        if (liveBrands) resolved.brands = liveBrands;
        else delete resolved.brands;
      }

      return resolved;
    });

  const productTypes = NAVIGATION_CONFIG.productTypes.filter((link) => !isHidden(link.href));

  return {
    ...NAVIGATION_CONFIG,
    primaryNav,
    shelves: buildMenuShelves(catalogEntries, productTypes),
    productTypes,
    footerColumns: NAVIGATION_CONFIG.footerColumns
      .map((column) => ({ ...column, links: column.links.filter((l) => !isHidden(l.href)) }))
      .filter((column) => column.links.length > 0),
  };
}
