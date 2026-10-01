import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { wishlistItems } from "@/db/schema";
import { buildPublishedProductsByIdsQuery } from "@/lib/catalog/postgres-queries";
import { toDiscoveryItem } from "@/lib/catalog/postgres-reader";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { logger } from "@/lib/logger";
import { resolveCurrentCustomerId } from "./customer";

export type WishlistProductsState =
  | { status: "UNAUTHENTICATED" }
  | { status: "OK"; products: ProductDiscoveryItem[] }
  | { status: "ERROR" };

/**
 * The signed-in customer's saved products as catalog cards, most recently saved first. Products
 * that are no longer published stay in the table but are left out here (domain model §39).
 */
export async function getCurrentWishlistProducts(): Promise<WishlistProductsState> {
  try {
    const customerId = await resolveCurrentCustomerId();
    if (!customerId) return { status: "UNAUTHENTICATED" };

    const saved = await db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(eq(wishlistItems.customerId, customerId))
      .orderBy(desc(wishlistItems.createdAt));
    if (saved.length === 0) return { status: "OK", products: [] };

    const productIds = saved.map((row) => row.productId);
    const rows = await buildPublishedProductsByIdsQuery(productIds);
    const byId = new Map(rows.map((row) => [row.id, toDiscoveryItem(row)]));

    return {
      status: "OK",
      products: productIds.flatMap((id) => byId.get(id) ?? []),
    };
  } catch {
    logger.error({ event: "wishlist_products_read_failed" });
    return { status: "ERROR" };
  }
}
