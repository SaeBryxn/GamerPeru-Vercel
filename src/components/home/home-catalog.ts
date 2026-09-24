import "server-only";
import { getCachedCategory } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/reader";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
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
