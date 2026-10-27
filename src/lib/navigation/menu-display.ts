import { z } from "zod";
import { SafeString } from "@/lib/validation/safe-string";
import { ProductSelectionSchema } from "@/lib/catalog/curated-products";

const ProductSlug = z
  .string()
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Editorial settings live in the existing menu JSON; catalog membership keeps its foreign keys. */
export const MenuDisplaySchema = z
  .object({
    itemsPerBrand: z.number().int().min(1).max(8).default(5),
    singleBrandItems: z.number().int().min(1).max(12).default(8),
    productLabels: z
      .record(ProductSlug, SafeString(1, 80))
      .refine((labels) => Object.keys(labels).length <= 200, "Usa como máximo 200 nombres cortos.")
      .default({}),
  })
  .strict();

export type MenuDisplay = z.infer<typeof MenuDisplaySchema>;
export const defaultMenuDisplay = (): MenuDisplay => MenuDisplaySchema.parse({});
export const MenuProductSelectionSchema = ProductSelectionSchema.extend({
  menuDisplay: MenuDisplaySchema.optional(),
});
export type MenuProductSelection = z.infer<typeof MenuProductSelectionSchema>;

export function menuProductLabel(
  product: { slug: string; name: string; brandName?: string },
  display?: MenuDisplay
): string {
  const custom = display?.productLabels[product.slug];
  if (custom) return custom;
  const brand = product.brandName;
  if (brand && product.name.toLocaleLowerCase().startsWith(`${brand.toLocaleLowerCase()} `)) {
    return product.name.slice(brand.length).trim();
  }
  return product.name;
}

export interface MenuBrandGroup {
  title: string;
  items: { label: string; href: string; description?: string }[];
  more?: { label: string; href: string };
}

/** Shared by the storefront and its admin preview; never infer brand/category from product names. */
export function buildMenuBrandGroups<
  T extends {
    slug: string;
    name: string;
    brandName: string;
    brandSlug?: string;
    categorySlug: string;
  },
>(
  entries: readonly T[],
  categorySlug: string,
  preserveOrder = false,
  config?: MenuDisplay
): MenuBrandGroup[] {
  const display = config ?? defaultMenuDisplay();
  const byBrand = new Map<string, T[]>();
  for (const entry of entries) {
    if (entry.categorySlug !== categorySlug) continue;
    const key = entry.brandSlug ?? entry.brandName;
    byBrand.set(key, [...(byBrand.get(key) ?? []), entry]);
  }
  return [...byBrand.values()]
    .sort((a, b) => (preserveOrder ? 0 : a[0]!.brandName.localeCompare(b[0]!.brandName)))
    .map((items) => {
      const brand = items[0]!;
      const limit = byBrand.size === 1 ? display.singleBrandItems : display.itemsPerBrand;
      return {
        title: brand.brandName,
        items: items.slice(0, limit).map((item) => ({
          label: menuProductLabel(item, display),
          href: `/productos/${item.slug}`,
          description: item.name,
        })),
        more: brand.brandSlug
          ? {
              label: `Ver todos · ${brand.brandName}`,
              href: `/categorias/${encodeURIComponent(categorySlug)}?${new URLSearchParams({ marca: brand.brandSlug })}`,
            }
          : undefined,
      };
    });
}
