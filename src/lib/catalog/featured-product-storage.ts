import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, homeSectionProducts, products, storefrontMenuProducts } from "@/db/schema";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import type { ProductSelection } from "./curated-products";

type Executor = Pick<typeof db, "select" | "insert" | "delete">;
export type FeaturedTarget = { sectionId: string } | { entryId: string };

export async function writeFeaturedProducts(
  executor: Executor,
  target: FeaturedTarget,
  selection: ProductSelection,
  categorySlug?: string
): Promise<ProductSelection> {
  const slugs = selection.mode === "manual" ? selection.productSlugs : [];
  const rows = slugs.length
    ? await executor
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            inArray(products.slug, slugs),
            eq(products.status, "PUBLISHED"),
            categorySlug ? eq(categories.slug, categorySlug) : undefined
          )
        )
    : [];
  if (rows.length !== slugs.length)
    throw new CatalogDomainError(
      "Un producto elegido ya no está publicado o pertenece a otra categoría. Revisa la selección.",
      "INVALID_FEATURED_PRODUCTS",
      422
    );
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  if ("sectionId" in target) {
    await executor
      .delete(homeSectionProducts)
      .where(eq(homeSectionProducts.sectionId, target.sectionId));
    if (slugs.length)
      await executor.insert(homeSectionProducts).values(
        slugs.map((slug, displayOrder) => ({
          sectionId: target.sectionId,
          productId: bySlug.get(slug)!,
          displayOrder,
        }))
      );
  } else {
    await executor
      .delete(storefrontMenuProducts)
      .where(eq(storefrontMenuProducts.entryId, target.entryId));
    if (slugs.length)
      await executor.insert(storefrontMenuProducts).values(
        slugs.map((slug, displayOrder) => ({
          entryId: target.entryId,
          productId: bySlug.get(slug)!,
          displayOrder,
        }))
      );
  }
  // Only editorial mode stays in JSON; membership and order live behind foreign keys.
  return { mode: selection.mode, productSlugs: [] };
}

export async function readHomeFeaturedProducts(
  sectionIds: string[],
  database: Pick<typeof db, "select"> = db
) {
  if (!sectionIds.length) return [];
  return database
    .select({ ownerId: homeSectionProducts.sectionId, slug: products.slug })
    .from(homeSectionProducts)
    .innerJoin(products, eq(products.id, homeSectionProducts.productId))
    .where(inArray(homeSectionProducts.sectionId, sectionIds))
    .orderBy(asc(homeSectionProducts.displayOrder));
}

export async function readMenuFeaturedProducts() {
  return db
    .select({ ownerId: storefrontMenuProducts.entryId, slug: products.slug })
    .from(storefrontMenuProducts)
    .innerJoin(products, eq(products.id, storefrontMenuProducts.productId))
    .orderBy(asc(storefrontMenuProducts.displayOrder));
}

export function featuredSlugsByOwner(
  rows: { ownerId: string; slug: string }[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.ownerId, [...(map.get(row.ownerId) ?? []), row.slug]);
  return map;
}

export function hydrateHomeSelection(
  content: Record<string, unknown>,
  slugs?: string[]
): Record<string, unknown> {
  const selection = content.selection as ProductSelection | undefined;
  return slugs && selection?.mode === "manual"
    ? { ...content, selection: { ...selection, productSlugs: slugs } }
    : content;
}

/** A legacy installation may lack the relation; other failures must not become cached emptiness. */
export function isMissingFeaturedRelation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const candidate = current as { code?: string; cause?: unknown };
    if (candidate.code === "42P01") return true;
    current = candidate.cause;
  }
  return false;
}
