import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import type { NavLink } from "@/components/navigation/types";

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
