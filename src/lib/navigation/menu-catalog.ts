import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, mediaAssets, productVariants, products } from "@/db/schema";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { MegaMenuProduct, MegaMenuShelves, NavLink } from "@/components/navigation/types";

/** Cards that fit one shelf row without the panel scrolling. */
const SHELF_SIZE = 4;

export interface MenuCatalogEntry {
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  categorySlug: string;
  brandName: string;
  brandSlug: string;
  objectKey: string | null;
  altText: string | null;
}

/**
 * Published products as the navigation needs them: cheapest active variant for the price, and the
 * product's own image, falling back to its first global photo when no primary is designated —
 * the same resolution the category grid uses, so the menu and the listing never disagree.
 */
export async function getMenuCatalogEntries(): Promise<MenuCatalogEntry[]> {
  const cheapestActiveVariant = sql<number>`(
    SELECT MIN(pv.price_cents)
    FROM product_variants pv
    WHERE pv.product_id = ${products.id} AND pv.status = 'ACTIVE'
  )`;

  const displayMediaId = sql`COALESCE(
    ${products.primaryMediaId},
    (
      SELECT a.id
      FROM product_media pm
      JOIN media_assets a ON a.id = pm.media_asset_id
      WHERE pm.product_id = ${products.id}
        AND a.security_class = 'PUBLIC_MEDIA'
        AND a.media_type = 'IMAGE'
      ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
      LIMIT 1
    )
  )`;

  try {
    const rows = await db
      .selectDistinct({
        productId: products.id,
        name: products.name,
        slug: products.slug,
        priceCents: cheapestActiveVariant,
        categorySlug: categories.slug,
        brandName: brands.name,
        brandSlug: brands.slug,
        objectKey: mediaAssets.objectKey,
        altText: mediaAssets.altText,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(
        categories,
        and(eq(categories.id, products.categoryId), eq(categories.status, "PUBLISHED"))
      )
      .innerJoin(brands, and(eq(brands.id, products.brandId), eq(brands.status, "PUBLISHED")))
      .innerJoin(
        productVariants,
        and(eq(productVariants.productId, products.id), eq(productVariants.status, "ACTIVE"))
      )
      .leftJoin(
        mediaAssets,
        and(
          sql`${mediaAssets.id} = ${displayMediaId}`,
          eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
          eq(mediaAssets.mediaType, "IMAGE")
        )
      )
      .where(eq(products.status, "PUBLISHED"))
      .orderBy(desc(products.updatedAt), asc(products.name));

    return rows
      .filter((row) => row.priceCents !== null)
      .map((row) => ({
        productId: row.productId,
        name: row.name,
        slug: row.slug,
        priceCents: Number(row.priceCents),
        categorySlug: row.categorySlug,
        brandName: row.brandName,
        brandSlug: row.brandSlug,
        objectKey: row.objectKey,
        altText: row.altText,
      }));
  } catch {
    // The navigation must survive a database problem; an empty catalog renders an empty shelf.
    return [];
  }
}

function toMegaMenuProduct(entry: MenuCatalogEntry): MegaMenuProduct {
  const url = resolvePublicMediaUrl(entry.objectKey);
  return {
    id: entry.productId,
    title: entry.name,
    href: `/productos/${entry.slug}`,
    priceCents: entry.priceCents,
    images: url ? [url] : [],
  };
}

/**
 * Builds one shelf per collection href the menu offers.
 *
 * Collections are matched by their category path, so a collection pointing at a filtered URL
 * (for example accessories narrowed to skates) still shows that category's products rather than
 * silently rendering nothing.
 */
export function buildMenuShelves(
  entries: MenuCatalogEntry[],
  collections: NavLink[]
): MegaMenuShelves {
  const byCategory = new Map<string, MenuCatalogEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.categorySlug) ?? [];
    list.push(entry);
    byCategory.set(entry.categorySlug, list);
  }

  const shelves: Record<string, { totalCount: number; products: MegaMenuProduct[] }> = {};

  for (const collection of collections) {
    const match = /^\/categorias\/([a-z0-9-]+)/.exec(collection.href);
    const categorySlug = match?.[1];
    if (!categorySlug) continue;

    const items = byCategory.get(categorySlug) ?? [];
    if (items.length === 0) continue;

    shelves[collection.href] = {
      totalCount: items.length,
      products: items.slice(0, SHELF_SIZE).map(toMegaMenuProduct),
    };
  }

  return shelves;
}

/** Brand columns for the "series" layout, replacing invented product lines with real ones. */
export function buildBrandColumns(
  entries: MenuCatalogEntry[],
  categorySlug: string
): { title: string; items: NavLink[] }[] {
  const scoped = entries.filter((entry) => entry.categorySlug === categorySlug);
  const byBrand = new Map<string, MenuCatalogEntry[]>();

  for (const entry of scoped) {
    const list = byBrand.get(entry.brandName) ?? [];
    list.push(entry);
    byBrand.set(entry.brandName, list);
  }

  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brandName, items]) => ({
      title: brandName,
      items: items.map((item) => ({ label: item.name, href: `/productos/${item.slug}` })),
    }));
}

/** Large promo cards: the most recently updated published products that actually have a photo. */
export function buildPromoCards(
  entries: MenuCatalogEntry[],
  categorySlug: string,
  limit = 2
): { title: string; href: string; image: string }[] {
  return entries
    .filter((entry) => entry.categorySlug === categorySlug && entry.objectKey)
    .slice(0, limit)
    .flatMap((entry) => {
      const image = resolvePublicMediaUrl(entry.objectKey);
      if (!image) return [];
      return [{ title: entry.name, href: `/productos/${entry.slug}`, image }];
    });
}

/** Square tiles for the grid layout, using real published products when the category has any. */
export function buildProductTiles(
  entries: MenuCatalogEntry[],
  categorySlug: string,
  limit = 4
): { title: string; href: string; image: string }[] {
  return buildPromoCards(entries, categorySlug, limit);
}
