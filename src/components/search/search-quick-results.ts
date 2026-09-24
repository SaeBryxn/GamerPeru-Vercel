import {
  STOREFRONT_INVENTORY,
  productHref,
  type InventoryItem,
} from "@/lib/catalog/storefront-inventory";

export interface QuickResultProduct {
  id: string;
  name: string;
  href: string;
}

export interface QuickResultGroup {
  id: string;
  label: string;
  products: QuickResultProduct[];
}

// Display order and label of each quick-results group.
const GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  match: (item: InventoryItem) => boolean;
}> = [
  { id: "mouse", label: "Mouse", match: (item) => item.categorySlug === "mouses" },
  { id: "mousepad", label: "Mousepad", match: (item) => item.categorySlug === "mousepads" },
  {
    id: "skates",
    label: "Skates",
    match: (item) =>
      item.categorySlug === "accesorios" && item.specValues.accessory_type === "skates",
  },
];

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every query word must appear in the product name, brand or group label. */
function matches(item: InventoryItem, groupLabel: string, words: string[]): boolean {
  const haystack = fold(`${item.name} ${item.brand.name} ${groupLabel}`);
  return words.every((word) => haystack.includes(word));
}

/**
 * Quick results for the search panel, grouped by product type. An empty query
 * lists the whole inventory (popular items first); groups with no match are
 * left out.
 */
export function getQuickResults(query: string): QuickResultGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);

  return GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    products: STOREFRONT_INVENTORY.filter(
      (item) => group.match(item) && matches(item, group.label, words)
    )
      .sort((a, b) => Number(b.isPopular) - Number(a.isPopular))
      .map((item) => ({ id: item.id, name: item.name, href: productHref(item) })),
  })).filter((group) => group.products.length > 0);
}
