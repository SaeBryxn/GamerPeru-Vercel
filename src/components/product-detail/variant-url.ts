import { variantTitleSlug } from "@/lib/catalog/card-colors";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";

/** Query parameter that names the selected variant: /productos/atk-a9?color=blanco */
export const VARIANT_URL_PARAM = "color";

/** "Negro / Dorado" -> "negro-dorado": accents stripped, anything else collapsed to dashes. */
export function variantUrlSlug(variant: Pick<ProductVariantDetail, "title">): string {
  return variantTitleSlug(variant.title);
}

/** The variant a shared link points at, or null when the parameter is missing or unknown. */
export function findVariantFromSearch(
  variants: ProductVariantDetail[],
  search: string
): ProductVariantDetail | null {
  const wanted = new URLSearchParams(search).get(VARIANT_URL_PARAM);
  if (!wanted) return null;
  const slug = wanted.trim().toLowerCase();
  return variants.find((variant) => variantUrlSlug(variant) === slug) ?? null;
}

/** Same path with the variant's parameter set, keeping any other query and the hash. */
export function buildVariantHref(currentHref: string, variant: ProductVariantDetail): string {
  const url = new URL(currentHref);
  url.searchParams.set(VARIANT_URL_PARAM, variantUrlSlug(variant));
  return `${url.pathname}${url.search}${url.hash}`;
}
