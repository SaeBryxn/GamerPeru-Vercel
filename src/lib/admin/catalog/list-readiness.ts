import type { AdminProductListItem, AdminProductPendingFilter } from "./types";

export interface ProductReadinessGap {
  id: AdminProductPendingFilter;
  label: string;
  /** Section of the product editor that resolves this gap. */
  section: "media" | "variants" | "stock";
}

const GAP_MEDIA: ProductReadinessGap = { id: "media", label: "Falta foto", section: "media" };
const GAP_VARIANTS: ProductReadinessGap = {
  id: "variants",
  label: "Sin variante activa",
  section: "variants",
};
const GAP_PRICE: ProductReadinessGap = { id: "price", label: "Falta precio", section: "variants" };
const GAP_STOCK: ProductReadinessGap = { id: "stock", label: "Sin stock", section: "stock" };

/**
 * Gaps that keep a product from being sellable, derived from data the list query already returns.
 * The first three mirror the authoritative publish blockers; stock is advisory because a product
 * can be published while waiting for a restock.
 */
export function getProductReadinessGaps(item: AdminProductListItem): ProductReadinessGap[] {
  const gaps: ProductReadinessGap[] = [];

  if (!item.primaryMediaKey) gaps.push(GAP_MEDIA);
  if (item.activeVariants === 0) gaps.push(GAP_VARIANTS);
  else if (item.minActivePriceCents === null || item.minActivePriceCents <= 0) gaps.push(GAP_PRICE);
  if (item.activeVariantAts <= 0) gaps.push(GAP_STOCK);

  return gaps;
}

/** Gaps that block publication outright, as opposed to advisory ones such as stock. */
export function getBlockingGaps(item: AdminProductListItem): ProductReadinessGap[] {
  return getProductReadinessGaps(item).filter((gap) => gap.id !== "stock");
}

export function isReadyToPublish(item: AdminProductListItem): boolean {
  return getBlockingGaps(item).length === 0;
}
