"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, wishlistItems } from "@/db/schema";
import { logger } from "@/lib/logger";
import { resolveCurrentCustomerId } from "./customer";

export type WishlistState =
  { authenticated: false } | { authenticated: true; productIds: string[] };

export type SetWishlistItemResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" | "NOT_FOUND" | "ERROR" };

const setWishlistItemSchema = z.object({
  productId: z.string().uuid(),
  saved: z.boolean(),
});

/** Product ids the signed-in customer saved, newest first. */
export async function getWishlistAction(): Promise<WishlistState> {
  try {
    const customerId = await resolveCurrentCustomerId();
    if (!customerId) return { authenticated: false };

    const rows = await db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(eq(wishlistItems.customerId, customerId))
      .orderBy(desc(wishlistItems.createdAt));

    return { authenticated: true, productIds: rows.map((row) => row.productId) };
  } catch {
    logger.error({ event: "wishlist_read_failed" });
    return { authenticated: false };
  }
}

/**
 * Saves or removes one product. Idempotent: saving an already saved product or removing one that
 * is not there both succeed with the requested state.
 */
export async function setWishlistItemAction(input: unknown): Promise<SetWishlistItemResult> {
  const parsed = setWishlistItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const { productId, saved } = parsed.data;

  try {
    const customerId = await resolveCurrentCustomerId();
    if (!customerId) return { ok: false, reason: "UNAUTHENTICATED" };

    if (!saved) {
      await db
        .delete(wishlistItems)
        .where(
          and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId))
        );
      return { ok: true, saved: false };
    }

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.status, "PUBLISHED")))
      .limit(1);
    if (!product) return { ok: false, reason: "NOT_FOUND" };

    await db.insert(wishlistItems).values({ customerId, productId }).onConflictDoNothing();
    return { ok: true, saved: true };
  } catch {
    logger.error({ event: "wishlist_write_failed" });
    return { ok: false, reason: "ERROR" };
  }
}
