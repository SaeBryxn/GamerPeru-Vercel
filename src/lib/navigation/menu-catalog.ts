import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  categories,
  categorySpecificationSchemas,
  mediaAssets,
  productSpecifications,
  productVariants,
  products,
} from "@/db/schema";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { cacheCatalogQuery } from "@/lib/catalog/catalog-cache";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { buildCardGallery } from "@/lib/catalog/card-gallery";
import { buildProductCardSpecs } from "@/lib/catalog/card-specs";
import { cardCompareAtSql, cardGallerySql, cardSingleVariantSql } from "@/lib/catalog/card-sql";
import type { ProductCardImage, ProductDiscoveryItem } from "@/lib/catalog/types";
import type { FooterColumn, MegaMenuShelves, NavLink } from "@/components/navigation/types";
import { buildMenuBrandGroups, menuProductLabel, type MenuDisplay } from "./menu-display";
import { matchCollectionEntries } from "./menu-collections";
import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";
import type { ValidatedSpecificationSchema } from "@/lib/discovery-filters/types";

/** Cards that fit one shelf row without the panel scrolling. */
const SHELF_SIZE = 4;

export interface MenuCatalogEntry {
  productId: string;
  name: string;
  slug: string;
  subtitle: string | null;
  priceCents: number;
  categoryName: string;
  categorySlug: string;
  categoryDisplayOrder?: number;
  specificationSchema?: ValidatedSpecificationSchema | null;
  specValues?: Record<string, unknown>;
  variantPrices?: number[];
  brandName: string;
  brandSlug: string;
  objectKey: string | null;
  altText: string | null;
  compareAtPriceCents: number | null;
  gallery: ProductCardImage[];
  singleVariantId: string | null;
  specs: ProductCardSpecList;
}

type ProductCardSpecList = ReturnType<typeof buildProductCardSpecs>;

/**
 * Published products as the navigation needs them: cheapest active variant for the price, and the
 * product's own image, falling back to its first global photo when no primary is designated —
 * the same resolution the category grid uses, so the menu and the listing never disagree.
 */
async function queryMenuCatalogEntries(): Promise<MenuCatalogEntry[]> {
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
        AND pm.placement = 'GALLERY'
        AND a.security_class = 'PUBLIC_MEDIA'
        AND a.media_type = 'IMAGE'
      ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
      LIMIT 1
    )
  )`;

  const rows = await db
    .selectDistinct({
      productId: products.id,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      priceCents: cheapestActiveVariant,
      compareAtPriceCents: cardCompareAtSql(cheapestActiveVariant),
      gallery: cardGallerySql,
      singleVariantId: cardSingleVariantSql,
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryId: categories.id,
      categoryDisplayOrder: categories.displayOrder,
      specSchemaId: categorySpecificationSchemas.id,
      specSchemaVersion: categorySpecificationSchemas.schemaVersion,
      productSpecSchemaId: productSpecifications.schemaId,
      variantPrices: sql<
        number[]
      >`(select array_agg(pv.price_cents) from product_variants pv where pv.product_id=${products.id} and pv.status='ACTIVE')`,
      specValues: productSpecifications.specValues,
      specFieldDefinitions: categorySpecificationSchemas.fieldDefinitions,
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
    .leftJoin(productSpecifications, eq(productSpecifications.productId, products.id))
    .leftJoin(
      categorySpecificationSchemas,
      and(
        eq(categorySpecificationSchemas.id, categories.currentSpecSchemaId),
        eq(categorySpecificationSchemas.isActive, true)
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
      subtitle: row.subtitle,
      priceCents: Number(row.priceCents),
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      categoryDisplayOrder: row.categoryDisplayOrder,
      variantPrices: row.variantPrices,
      specValues: row.productSpecSchemaId === row.specSchemaId ? (row.specValues ?? {}) : {},
      specificationSchema:
        row.specSchemaId && row.specSchemaVersion !== null
          ? validateSpecificationSchema({
              id: row.specSchemaId,
              categoryId: row.categoryId,
              schemaVersion: row.specSchemaVersion,
              fieldDefinitions: row.specFieldDefinitions,
            })
          : null,
      brandName: row.brandName,
      brandSlug: row.brandSlug,
      objectKey: row.objectKey,
      altText: row.altText,
      compareAtPriceCents: row.compareAtPriceCents,
      gallery: buildCardGallery(
        row.objectKey ? { objectKey: row.objectKey, altText: row.altText } : null,
        row.gallery
      ),
      singleVariantId: row.singleVariantId,
      specs: buildProductCardSpecs(row.specValues, row.specFieldDefinitions),
    }));
}

const readMenuCatalogEntries = cacheCatalogQuery("menu-catalog-entries", queryMenuCatalogEntries);

export async function getMenuCatalogEntries(): Promise<MenuCatalogEntry[]> {
  // Fixture runs render no shelves: hidden menu cards would otherwise inflate page-level card
  // counts, and the connected database is not the fixture catalog.
  if (resolveCatalogReaderMode() === "e2e-fixture") return [];

  try {
    return await readMenuCatalogEntries();
  } catch {
    // The navigation must survive a database problem; an empty catalog renders an empty shelf.
    return [];
  }
}

function toDiscoveryItem(entry: MenuCatalogEntry): ProductDiscoveryItem {
  return {
    id: entry.productId,
    name: entry.name,
    slug: entry.slug,
    subtitle: entry.subtitle,
    brand: { name: entry.brandName, slug: entry.brandSlug },
    category: { name: entry.categoryName, slug: entry.categorySlug },
    primaryMedia: entry.objectKey
      ? { objectKey: entry.objectKey, altText: entry.altText, width: null, height: null }
      : null,
    startingPriceCents: entry.priceCents,
    compareAtPriceCents: entry.compareAtPriceCents,
    gallery: entry.gallery,
    singleVariantId: entry.singleVariantId,
    specs: entry.specs,
  };
}

/**
 * Builds one shelf per collection href the menu offers.
 *
 * Filtered collections use their technical schema, so Skates cannot show keycaps or keyboards.
 */
export function buildMenuShelves(
  entries: MenuCatalogEntry[],
  collections: NavLink[]
): MegaMenuShelves {
  const shelves: Record<string, { totalCount: number; products: ProductDiscoveryItem[] }> = {};

  for (const collection of collections) {
    const items = matchCollectionEntries(entries, collection.href);
    if (items.length === 0) continue;

    shelves[collection.href] = {
      totalCount: items.length,
      products: items.slice(0, SHELF_SIZE).map(toDiscoveryItem),
    };
  }

  return shelves;
}

/** Brand columns for the "series" layout, replacing invented product lines with real ones. */
export function buildBrandColumns(
  entries: MenuCatalogEntry[],
  categorySlug: string,
  preserveOrder = false,
  display?: MenuDisplay
) {
  return buildMenuBrandGroups(entries, categorySlug, preserveOrder, display);
}

/** Large promo cards: the most recently updated published products that actually have a photo. */
export function buildPromoCards(
  entries: MenuCatalogEntry[],
  categorySlug: string,
  limit = 2,
  display?: MenuDisplay
): { title: string; href: string; image: string }[] {
  return entries
    .filter((entry) => entry.categorySlug === categorySlug && entry.objectKey)
    .slice(0, limit)
    .flatMap((entry) => {
      const image = resolvePublicMediaUrl(entry.objectKey);
      if (!image) return [];
      return [{ title: menuProductLabel(entry, display), href: `/productos/${entry.slug}`, image }];
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

const FOOTER_PRODUCT_COLUMNS = 2;
const FOOTER_PRODUCTS_PER_COLUMN = 6;

/**
 * Footer product columns: the categories with the most published products, each listing its
 * products by name. Built from the same entries as the mega menu, so both agree on what is sold.
 */
export function buildFooterProductColumns(
  entries: MenuCatalogEntry[],
  isCategoryHidden: (categorySlug: string) => boolean
): FooterColumn[] {
  const byCategory = new Map<string, { title: string; links: NavLink[] }>();
  for (const entry of entries) {
    if (isCategoryHidden(entry.categorySlug)) continue;
    const column = byCategory.get(entry.categorySlug) ?? { title: entry.categoryName, links: [] };
    column.links.push({ label: entry.name, href: `/productos/${entry.slug}` });
    byCategory.set(entry.categorySlug, column);
  }

  return [...byCategory.values()]
    .sort((a, b) => b.links.length - a.links.length || a.title.localeCompare(b.title))
    .slice(0, FOOTER_PRODUCT_COLUMNS)
    .map((column) => ({
      title: column.title,
      links: column.links
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, FOOTER_PRODUCTS_PER_COLUMN),
    }));
}
