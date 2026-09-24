/**
 * Real storefront inventory used by the local catalog preview
 * (DEV_CATALOG_PREVIEW=1), the mega-menu shelves and the search panel's quick
 * results. Client-safe: plain data, no server imports.
 *
 * Product photos: drop each file at `public${imagePlaceholder}` (e.g.
 * public/media/productos/atk-a9-plus-2-0-black.jpg). `/media` is the local
 * CDN root, so the same object key works against media.gamerperu.com later.
 */

export type InventoryCategorySlug = "mouses" | "mousepads" | "accesorios";

export interface InventoryItem {
  id: string;
  slug: string;
  name: string;
  brand: { name: string; slug: string };
  categorySlug: InventoryCategorySlug;
  priceCents: number;
  /** Public path of the product photo, relative to /public. */
  imagePlaceholder: string;
  /** Model family, so colorways of one model group into a single card. */
  family: string;
  /** Colorway sold under this listing, shown as the single variant. */
  color: string | null;
  isPopular: boolean;
  /** Only facts the listing itself states (e.g. accessory type). */
  specValues: Record<string, string>;
}

/**
 * URL-safe slug: accents stripped, "2.0" -> "2-0", anything else collapsed to
 * single dashes. "ATK A9 Plus 2.0 Black" -> "atk-a9-plus-2-0-black".
 */
export function slugifyProductName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Object key for the media resolver (the path below the /media CDN root). */
export function inventoryObjectKey(item: InventoryItem): string {
  return item.imagePlaceholder.replace(/^\/media\//, "");
}

export const INVENTORY_BRANDS = {
  atk: { name: "ATK", slug: "atk" },
  mchose: { name: "Mchose", slug: "mchose" },
  jinms: { name: "JINMS", slug: "jinms" },
  xraypad: { name: "X-Raypad", slug: "x-raypad" },
} as const;

interface RawItem {
  name: string;
  family: string;
  brand: { name: string; slug: string };
  categorySlug: InventoryCategorySlug;
  soles: number;
  color?: string;
  isPopular?: boolean;
  specValues?: Record<string, string>;
}

const RAW_INVENTORY: RawItem[] = [
  // Mouse
  {
    name: "ATK A9 Plus 2.0 Black",
    family: "ATK A9 Plus 2.0",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mouses",
    soles: 189,
    color: "Negro",
    isPopular: true,
  },
  {
    name: "ATK A9 Plus 2.0 White",
    family: "ATK A9 Plus 2.0",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mouses",
    soles: 195,
    color: "Blanco",
  },
  {
    name: "ATK A9 PRO MAX White",
    family: "ATK A9 PRO MAX",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mouses",
    soles: 289,
    color: "Blanco",
  },
  {
    name: "Mchose A7 V3 Pro+ White",
    family: "Mchose A7 V3 Pro+",
    brand: INVENTORY_BRANDS.mchose,
    categorySlug: "mouses",
    soles: 359,
    color: "Blanco",
  },
  {
    name: "Mchose K7 v2 Ultra+ Black Gold",
    family: "Mchose K7 v2 Ultra+",
    brand: INVENTORY_BRANDS.mchose,
    categorySlug: "mouses",
    soles: 399,
    color: "Negro / Dorado",
  },
  {
    name: "Mchose K7 v2 Ultra+ White Gold",
    family: "Mchose K7 v2 Ultra+",
    brand: INVENTORY_BRANDS.mchose,
    categorySlug: "mouses",
    soles: 399,
    color: "Blanco / Dorado",
  },
  {
    name: "JINMS X7 Ultra Black",
    family: "JINMS X7 Ultra",
    brand: INVENTORY_BRANDS.jinms,
    categorySlug: "mouses",
    soles: 159,
    color: "Negro",
  },
  // Mousepad
  {
    name: "ATK Anime Mouse Pad - Reverie Pink",
    family: "ATK Anime Mouse Pad",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mousepads",
    soles: 109,
    color: "Rosado",
  },
  {
    name: "ATK Sky Black (Large Size)",
    family: "ATK Sky",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mousepads",
    soles: 129,
    color: "Negro",
  },
  {
    name: "ATK Sky Orange (Large Size)",
    family: "ATK Sky",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mousepads",
    soles: 129,
    color: "Naranja",
  },
  {
    name: "ATK Sky Orange (Small Size)",
    family: "ATK Sky",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mousepads",
    soles: 99,
    color: "Naranja",
  },
  {
    name: "ATK 99G Air Mouse Pad Green",
    family: "ATK 99G Air Mouse Pad",
    brand: INVENTORY_BRANDS.atk,
    categorySlug: "mousepads",
    soles: 119,
    color: "Verde",
  },
  // Skates (accesorios, accessory_type = skates)
  {
    name: "X-Raypad JADE AIR",
    family: "X-Raypad JADE AIR",
    brand: INVENTORY_BRANDS.xraypad,
    categorySlug: "accesorios",
    soles: 59,
    specValues: { accessory_type: "skates" },
  },
  {
    name: "X-Raypad Obsidian Air Pro",
    family: "X-Raypad Obsidian Air Pro",
    brand: INVENTORY_BRANDS.xraypad,
    categorySlug: "accesorios",
    soles: 69,
    specValues: { accessory_type: "skates" },
  },
];

export const STOREFRONT_INVENTORY: readonly InventoryItem[] = RAW_INVENTORY.map((raw, index) => {
  const slug = slugifyProductName(raw.name);
  return {
    id: `018f0000-0000-7000-8000-invt${String(index + 1).padStart(4, "0")}`,
    slug,
    name: raw.name,
    brand: raw.brand,
    categorySlug: raw.categorySlug,
    priceCents: raw.soles * 100,
    imagePlaceholder: `/media/productos/${slug}.jpg`,
    family: raw.family,
    color: raw.color ?? null,
    isPopular: raw.isPopular ?? false,
    specValues: raw.specValues ?? {},
  };
});

/** Popular items first, then the listed order. */
export function inventoryByCategory(categorySlug: InventoryCategorySlug): InventoryItem[] {
  return STOREFRONT_INVENTORY.filter((item) => item.categorySlug === categorySlug).sort(
    (a, b) => Number(b.isPopular) - Number(a.isPopular)
  );
}

export function productHref(item: InventoryItem): string {
  return `/productos/${item.slug}`;
}

export interface InventoryFamily {
  id: string;
  name: string;
  brand: { name: string; slug: string };
  categorySlug: InventoryCategorySlug;
  /** Listings of this model, popular first. */
  items: InventoryItem[];
  /** Listing opened from the family card. */
  lead: InventoryItem;
  fromPriceCents: number;
}

/**
 * One entry per model: the colorways of a model collapse into a single card,
 * and their count is what the superscript on that card means.
 */
export function inventoryFamilies(): InventoryFamily[] {
  const byFamily = new Map<string, InventoryItem[]>();
  for (const item of STOREFRONT_INVENTORY) {
    const current = byFamily.get(item.family);
    if (current) current.push(item);
    else byFamily.set(item.family, [item]);
  }

  return [...byFamily.entries()].map(([name, items]) => {
    const sorted = [...items].sort((a, b) => Number(b.isPopular) - Number(a.isPopular));
    const lead = sorted[0]!;
    return {
      id: slugifyProductName(name),
      name,
      brand: lead.brand,
      categorySlug: lead.categorySlug,
      items: sorted,
      lead,
      fromPriceCents: Math.min(...items.map((item) => item.priceCents)),
    };
  });
}
