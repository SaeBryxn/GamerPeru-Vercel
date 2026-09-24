import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ProductDetailEntity, ProductMediaItem } from "./product-detail-types";
import {
  INVENTORY_BRANDS,
  STOREFRONT_INVENTORY,
  inventoryObjectKey,
  type InventoryItem,
} from "./storefront-inventory";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_NAV_BRANDS,
  SYNTHETIC_SPEC_SCHEMAS,
  type SyntheticBrandEntry,
  type SyntheticProductWithSpecs,
} from "./synthetic-catalog-data";

/**
 * Adapts the real storefront inventory to the local catalog preview
 * (DEV_CATALOG_PREVIEW=1). Photos are picked up as soon as they exist under
 * public/media/productos; until then mice fall back to the showcase shots and
 * other products render the neutral media fallback.
 */

const MOUSE_FALLBACK_KEYS = [
  "mega-menu/angulo-1.png",
  "mega-menu/angulo-2.png",
  "mega-menu/angulo-3.png",
] as const;

const BASE_TIMESTAMP = 1700000000000;

/** Inventory brands, reusing the navigation brand entry (and id) when one exists. */
export const INVENTORY_BRAND_ENTRIES: Record<string, SyntheticBrandEntry> = Object.fromEntries(
  Object.values(INVENTORY_BRANDS).map((brand, index) => [
    brand.slug,
    SYNTHETIC_NAV_BRANDS[brand.slug] ?? {
      id: `018f0000-0000-7000-8000-000000000c${String(index + 1).padStart(2, "0")}`,
      name: brand.name,
      slug: brand.slug,
      description: null,
      logo: null,
      status: "PUBLISHED" as const,
    },
  ])
);

function hasLocalPhoto(item: InventoryItem): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", item.imagePlaceholder));
  } catch {
    return false;
  }
}

function galleryKeys(item: InventoryItem): { keys: readonly string[]; mimeType: string } {
  if (hasLocalPhoto(item)) {
    return { keys: [inventoryObjectKey(item)], mimeType: "image/jpeg" };
  }
  if (item.categorySlug === "mouses") {
    return { keys: MOUSE_FALLBACK_KEYS, mimeType: "image/png" };
  }
  return { keys: [], mimeType: "image/png" };
}

function categoryName(item: InventoryItem): string {
  return SYNTHETIC_CATEGORIES[item.categorySlug]?.name ?? item.categorySlug;
}

/** Listing rows; the inventory order doubles as the "most recent" order. */
export function getInventoryPreviewProducts(): SyntheticProductWithSpecs[] {
  return STOREFRONT_INVENTORY.map((item, index) => {
    const { keys } = galleryKeys(item);
    const createdAt = new Date(BASE_TIMESTAMP - index * 100000).toISOString();
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      subtitle: null,
      brand: { name: item.brand.name, slug: item.brand.slug },
      category: { name: categoryName(item), slug: item.categorySlug },
      primaryMedia: keys[0]
        ? { objectKey: keys[0], altText: item.name, width: null, height: null }
        : null,
      startingPriceCents: item.priceCents,
      specValues: item.specValues,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

/**
 * PDP entity for an inventory item: one variant at the listed price (each
 * colorway is its own listing), no compare-at price and no story, since the
 * catalog holds no such data for these products yet.
 */
export function buildInventoryProductDetail(slug: string): ProductDetailEntity | null {
  const index = STOREFRONT_INVENTORY.findIndex((entry) => entry.slug === slug);
  const item = STOREFRONT_INVENTORY[index];
  if (!item) return null;

  const category = SYNTHETIC_CATEGORIES[item.categorySlug];
  const brand = INVENTORY_BRAND_ENTRIES[item.brand.slug];
  if (!category || !brand) return null;

  const variantId = `${item.id}-v01`;
  const { keys, mimeType } = galleryKeys(item);
  const media: ProductMediaItem[] = keys.map((objectKey, mediaIndex) => ({
    id: `${item.id}-m${mediaIndex + 1}`,
    productId: item.id,
    mediaAssetId: `${item.id}-a${mediaIndex + 1}`,
    variantId: null,
    displayOrder: mediaIndex + 1,
    asset: {
      objectKey,
      mimeType,
      fileSizeBytes: 0,
      width: null,
      height: null,
      altText: mediaIndex === 0 ? item.name : `${item.name} — vista ${mediaIndex + 1}`,
    },
  }));

  const schema = SYNTHETIC_SPEC_SCHEMAS[item.categorySlug];
  const hasSpecs = Object.keys(item.specValues).length > 0;
  const createdAt = new Date(BASE_TIMESTAMP - index * 100000).toISOString();

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    subtitle: null,
    description: null,
    createdAt,
    updatedAt: createdAt,
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
    variants: [
      {
        id: variantId,
        productId: item.id,
        sku: `SKU-${item.slug.toUpperCase()}`,
        title: item.color ?? "Estándar",
        priceCents: item.priceCents,
        compareAtPriceCents: null,
        weightGrams: null,
        displayOrder: 1,
        status: "ACTIVE",
        attributes: item.color ? { color: item.color } : {},
      },
    ],
    media,
    specifications:
      schema && hasSpecs
        ? {
            id: item.id,
            productId: item.id,
            schemaId: schema.id,
            schemaVersion: schema.schemaVersion,
            specValues: item.specValues,
            schema,
          }
        : null,
    story: null,
  };
}
