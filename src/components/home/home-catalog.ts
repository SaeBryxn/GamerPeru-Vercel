import "server-only";
import { getCachedCategory } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/reader";
import type { BrandDiscoveryEntity, ProductDiscoveryItem } from "@/lib/catalog/types";
import { logger } from "@/lib/logger";

/**
 * Products for a homepage rail. A rail is decorative: if the catalog is
 * unreachable the page still renders, just without that rail.
 */
export async function loadRailProducts(
  categorySlug: string,
  limit = 12
): Promise<ProductDiscoveryItem[]> {
  try {
    const category = await getCachedCategory(categorySlug);
    if (!category) return [];

    const result = await getCatalogReader().getPublishedProductsByCategory(category.id, {
      page: 1,
      pageSize: limit,
    });
    return result.items;
  } catch {
    logger.warn({ event: "home_rail_products_unavailable", categorySlug });
    return [];
  }
}

/** Products for the showcase rail over the hero: every category, featured first. */
export async function loadShowcaseProducts(limit = 16): Promise<ProductDiscoveryItem[]> {
  try {
    return await getCatalogReader().getShowcaseProducts(limit);
  } catch {
    logger.warn({ event: "home_showcase_products_unavailable" });
    return [];
  }
}

/** Brands for the strip under the first section; decorative, so a failed read just hides it. */
export async function loadShowcaseBrands(): Promise<BrandDiscoveryEntity[]> {
  try {
    return await getCatalogReader().getShowcaseBrands();
  } catch {
    logger.warn({ event: "home_showcase_brands_unavailable" });
    return [];
  }
}
