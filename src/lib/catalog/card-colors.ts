import type { ProductCardColor } from "./types";

/** One active variant as the card query reads it, in display order. */
export interface CardVariantColorRow {
  title: string;
  /** colorway, else color; null when the variant has neither. */
  color: string | null;
  /** True when the variant carries no attributes at all (e.g. created with only a title). */
  bare: boolean;
}

/** "Negro / Dorado" -> "negro-dorado": the `?color=` value the product page understands. */
export function variantTitleSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The colours a card advertises, so a shopper sees there is more than the black one in the photo.
 * Each colour links to the first variant that has it. A variant saved with only its title counts
 * as that colour when its siblings are colours, matching the product page; anything else (sizes
 * only, mixed attributes) shows no dots rather than guessing.
 */
export function buildCardColors(rows: readonly CardVariantColorRow[] | null): ProductCardColor[] {
  if (!rows || rows.length < 2 || !rows.some((row) => row.color)) return [];
  if (!rows.every((row) => Boolean(row.color) || row.bare)) return [];

  const colors: ProductCardColor[] = [];
  for (const row of rows) {
    const name = (row.color ?? row.title).trim();
    if (!name || colors.some((color) => color.name.toLowerCase() === name.toLowerCase())) continue;
    colors.push({ name, variantSlug: variantTitleSlug(row.title) });
  }
  return colors.length >= 2 ? colors : [];
}
