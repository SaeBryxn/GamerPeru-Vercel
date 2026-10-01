import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, mediaAssets, productVariants, products, type Cart } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  ANONYMOUS_CART_TTL_MS,
  AUTHENTICATED_CART_TTL_MS,
  CANONICAL_CART_CURRENCY,
  MAX_CART_LINE_QUANTITY,
} from "./constants";
import type { CartHydrationLine, CartOwner } from "./internal-types";
import { generateAnonymousSessionToken } from "./session";

export type DatabaseExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AnonymousMutationCartResolution {
  cart: Cart;
  authoritativeToken: string;
  isNewCart: boolean;
}

export type ExistingCartResolutionResult =
  { success: true; cart: Cart } | { success: false; code: "ITEM_NOT_FOUND"; error: string };

/**
 * Retires a cart by setting status to ABANDONED.
 */
export async function retireCartById(cartId: string, executor: DatabaseExecutor): Promise<void> {
  const now = new Date();
  await executor
    .update(carts)
    .set({ status: "ABANDONED", updatedAt: now })
    .where(eq(carts.id, cartId));
}

/**
 * Acquires a PostgreSQL transaction-scoped advisory lock for an anonymous session token.
 * This guarantees deterministic serialization of concurrent mutations for the same session token,
 * eliminating the READ COMMITTED statement-snapshot race during expired ACTIVE cart replacement.
 */
export async function lockAnonymousSessionTokenForMutation(
  sessionToken: string,
  executor: DatabaseExecutor
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${sessionToken}, 42424242))`
  );
}

/**
 * Safely resolves or creates an ACTIVE Cart for the given owner within a transaction.
 *
 * Invariants:
 * 1. Locks existing ACTIVE row with FOR UPDATE.
 * 2. If row is expired (expires_at < NOW()), transitions ACTIVE -> ABANDONED.
 * 3. Attempts conflict-safe INSERT with ON CONFLICT DO NOTHING.
 * 4. If INSERT loses a race, re-queries and locks the authoritative winning ACTIVE cart.
 */
export async function getOrCreateActiveCart(
  owner: CartOwner,
  executor: DatabaseExecutor
): Promise<Cart> {
  const now = new Date();

  if (owner.type === "AUTHENTICATED") {
    const existing = await executor
      .select()
      .from(carts)
      .where(and(eq(carts.customerId, owner.customerProfileId), eq(carts.status, "ACTIVE")))
      .for("update")
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      const activeCart = existing[0];
      if (activeCart.expiresAt < now) {
        await retireCartById(activeCart.id, executor);
      } else {
        return activeCart;
      }
    }

    const expiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
    const [inserted] = await executor
      .insert(carts)
      .values({
        customerId: owner.customerProfileId,
        sessionToken: null,
        status: "ACTIVE",
        currency: CANONICAL_CART_CURRENCY,
        expiresAt,
      })
      .onConflictDoNothing({
        target: carts.customerId,
        where: sql`${carts.status} = 'ACTIVE' AND ${carts.customerId} IS NOT NULL`,
      })
      .returning();

    if (inserted) {
      return inserted;
    }

    const reselected = await executor
      .select()
      .from(carts)
      .where(and(eq(carts.customerId, owner.customerProfileId), eq(carts.status, "ACTIVE")))
      .for("update")
      .limit(1);

    if (!reselected[0]) {
      throw new Error("FAILED_TO_RESOLVE_AUTHENTICATED_CART");
    }

    return reselected[0];
  }

  // Anonymous Owner
  const existing = await executor
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, owner.sessionToken), eq(carts.status, "ACTIVE")))
    .for("update")
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const activeCart = existing[0];
    if (activeCart.expiresAt < now) {
      await retireCartById(activeCart.id, executor);
    } else {
      return activeCart;
    }
  }

  const expiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
  const [inserted] = await executor
    .insert(carts)
    .values({
      customerId: null,
      sessionToken: owner.sessionToken,
      status: "ACTIVE",
      currency: CANONICAL_CART_CURRENCY,
      expiresAt,
    })
    .onConflictDoNothing({
      target: carts.sessionToken,
      where: sql`${carts.status} = 'ACTIVE' AND ${carts.sessionToken} IS NOT NULL`,
    })
    .returning();

  if (inserted) {
    return inserted;
  }

  const reselected = await executor
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, owner.sessionToken), eq(carts.status, "ACTIVE")))
    .for("update")
    .limit(1);

  if (!reselected[0]) {
    throw new Error("FAILED_TO_RESOLVE_ANONYMOUS_CART");
  }

  return reselected[0];
}

/**
 * Resolves or creates an authoritative Cart for an anonymous mutation.
 *
 * Token Policy (Binding CART4-R4 Contract):
 * 1. NO TOKEN / MALFORMED: Generates a fresh 256-bit server token and creates a new ACTIVE cart.
 * 2. VALID FORMAT TOKEN: Acquires a transaction-scoped advisory lock to serialize concurrent mutations on this token.
 * 3. KNOWN ACTIVE UNEXPIRED: Locks row and reuses the active cart and session token.
 * 4. KNOWN ACTIVE EXPIRED (Immediate Replacement Continuity):
 *    Locks old active cart, marks it ABANDONED, and creates replacement ACTIVE cart using the
 *    SAME proven server-issued session token. (Zero line revival: old items stay historical).
 * 5. NO ACTIVE CART (Unknown or Stale Historical ABANDONED/CONVERTED Token):
 *    Non-authoritative -> Rotates strictly to a fresh 256-bit server token.
 */
export async function resolveAnonymousMutationCart(
  guestToken: string | null,
  isMalformedGuest: boolean,
  executor: DatabaseExecutor
): Promise<AnonymousMutationCartResolution> {
  const now = new Date();

  // 1. No token or malformed token: Generate fresh 256-bit server token
  if (!guestToken || isMalformedGuest) {
    const newToken = generateAnonymousSessionToken();
    const cart = await getOrCreateActiveCart(
      { type: "ANONYMOUS", sessionToken: newToken },
      executor
    );
    return { cart, authoritativeToken: newToken, isNewCart: true };
  }

  // 2. Valid format token: Acquire transaction-scoped advisory lock to serialize concurrent mutations on this token
  await lockAnonymousSessionTokenForMutation(guestToken, executor);

  // 3. Query active cart with FOR UPDATE lock
  const [existingActive] = await executor
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, guestToken), eq(carts.status, "ACTIVE")))
    .for("update")
    .limit(1);

  if (existingActive) {
    if (existingActive.expiresAt < now) {
      // KNOWN ACTIVE EXPIRED: Retire old active cart to ABANDONED
      await retireCartById(existingActive.id, executor);

      // Create/select replacement ACTIVE cart with the SAME known server-issued token
      const replacementCart = await getOrCreateActiveCart(
        { type: "ANONYMOUS", sessionToken: guestToken },
        executor
      );
      return { cart: replacementCart, authoritativeToken: guestToken, isNewCart: true };
    }

    // KNOWN ACTIVE UNEXPIRED: Reuse current active cart and token
    return { cart: existingActive, authoritativeToken: guestToken, isNewCart: false };
  }

  // 4. NO ACTIVE CART (Token is unknown, or only exists on historical ABANDONED / CONVERTED rows):
  // Non-authoritative credential -> Rotate strictly to fresh 256-bit server token
  const freshToken = generateAnonymousSessionToken();
  const freshCart = await getOrCreateActiveCart(
    { type: "ANONYMOUS", sessionToken: freshToken },
    executor
  );
  return { cart: freshCart, authoritativeToken: freshToken, isNewCart: true };
}

/**
 * Resolves an existing active Cart for non-creating mutations (update, remove).
 *
 * Invariants:
 * 1. Serializes token via transaction-scoped advisory lock.
 * 2. Locks existing ACTIVE cart row with FOR UPDATE.
 * 3. If no ACTIVE row exists: returns ITEM_NOT_FOUND.
 * 4. If ACTIVE row exists but is expired (expiresAt < NOW()):
 *    - Transitions old cart ACTIVE -> ABANDONED.
 *    - Does NOT create a replacement cart.
 *    - Does NOT refresh TTL.
 *    - Returns ITEM_NOT_FOUND.
 * 5. If ACTIVE row is unexpired: returns { success: true, cart }.
 */
export async function resolveExistingAnonymousMutationCart(
  guestToken: string | null,
  isMalformedGuest: boolean,
  executor: DatabaseExecutor
): Promise<ExistingCartResolutionResult> {
  if (!guestToken || isMalformedGuest) {
    return {
      success: false,
      code: "ITEM_NOT_FOUND",
      error: "El carrito no fue encontrado o ha expirado.",
    };
  }

  // Acquire transaction-scoped advisory lock to serialize concurrent mutations on this token
  await lockAnonymousSessionTokenForMutation(guestToken, executor);

  const [anonCart] = await executor
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, guestToken), eq(carts.status, "ACTIVE")))
    .for("update")
    .limit(1);

  if (!anonCart) {
    return {
      success: false,
      code: "ITEM_NOT_FOUND",
      error: "El carrito no fue encontrado o ha expirado.",
    };
  }

  if (anonCart.expiresAt < new Date()) {
    await retireCartById(anonCart.id, executor);
    return {
      success: false,
      code: "ITEM_NOT_FOUND",
      error: "El carrito no fue encontrado o ha expirado.",
    };
  }

  return {
    success: true,
    cart: anonCart,
  };
}

/**
 * Atomically inserts or increments a line item in a Cart, capping quantity at MAX_CART_LINE_QUANTITY (10).
 */
export async function atomicAddCartLine(
  cartId: string,
  variantId: string,
  quantityToAdd: number,
  executor: DatabaseExecutor
): Promise<void> {
  const now = new Date();
  await executor
    .insert(cartItems)
    .values({
      id: generateUuidV7(),
      cartId,
      variantId,
      quantity: quantityToAdd,
    })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: {
        quantity: sql`LEAST(${cartItems.quantity} + ${quantityToAdd}, ${MAX_CART_LINE_QUANTITY})`,
        updatedAt: now,
      },
    });
}

/**
 * Updates an existing line item quantity in a Cart.
 * Returns true if the line existed and was updated; false otherwise.
 */
export async function atomicUpdateCartLine(
  cartId: string,
  variantId: string,
  targetQuantity: number,
  executor: DatabaseExecutor
): Promise<boolean> {
  const now = new Date();
  const updatedRows = await executor
    .update(cartItems)
    .set({ quantity: targetQuantity, updatedAt: now })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
    .returning({ id: cartItems.id });

  return updatedRows.length > 0;
}

/**
 * Removes a line item from a Cart.
 * Returns true if a line was deleted; false otherwise.
 */
export async function atomicRemoveCartLine(
  cartId: string,
  variantId: string,
  executor: DatabaseExecutor
): Promise<boolean> {
  const deletedRows = await executor
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
    .returning({ id: cartItems.id });

  return deletedRows.length > 0;
}

/**
 * Refreshes the sliding TTL of a Cart.
 */
export async function refreshCartTtl(
  cartId: string,
  ttlMs: number,
  executor: DatabaseExecutor
): Promise<void> {
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + ttlMs);
  await executor
    .update(carts)
    .set({ expiresAt: newExpiresAt, updatedAt: now })
    .where(eq(carts.id, cartId));
}

/**
 * Merges a guest cart into an authenticated customer profile within an active transaction.
 *
 * Invariants:
 * 1. Lock Guest: FOR UPDATE lock on guest ACTIVE cart row.
 * 2. Expired Guest: If expired, guest -> ABANDONED, 0 items merged.
 * 3. Empty Guest: If empty, guest -> ABANDONED, 0 items merged.
 * 4. Duplicate Formula: MIN(authQty + guestQty, 10) via PostgreSQL atomic UPSERT.
 * 5. Destination TTL: Authenticated destination cart refreshed to +60 days.
 * 6. Exactly-Once: Guest transitioned to ABANDONED (never CONVERTED).
 */
export async function mergeGuestCartIntoAuthenticated(
  customerProfileId: string,
  guestToken: string,
  executor: DatabaseExecutor
): Promise<{ merged: boolean; shouldClearCookie: boolean }> {
  const now = new Date();

  const [guestCart] = await executor
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, guestToken), eq(carts.status, "ACTIVE")))
    .for("update")
    .limit(1);

  if (!guestCart) {
    return { merged: false, shouldClearCookie: true };
  }

  if (guestCart.expiresAt < now) {
    await retireCartById(guestCart.id, executor);
    return { merged: false, shouldClearCookie: true };
  }

  const guestLines = await executor
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, guestCart.id))
    .for("update");

  if (guestLines.length === 0) {
    await retireCartById(guestCart.id, executor);
    return { merged: false, shouldClearCookie: true };
  }

  const authCart = await getOrCreateActiveCart(
    { type: "AUTHENTICATED", customerProfileId, authUserId: "" },
    executor
  );

  for (const line of guestLines) {
    await atomicAddCartLine(authCart.id, line.variantId, line.quantity, executor);
  }

  await refreshCartTtl(authCart.id, AUTHENTICATED_CART_TTL_MS, executor);
  await retireCartById(guestCart.id, executor);

  return { merged: true, shouldClearCookie: true };
}

/**
 * Queries and joins line items for a given cart ID with catalog status and primary media.
 */
export async function queryCartHydrationLines(
  cartId: string,
  executor: DatabaseExecutor = db
): Promise<CartHydrationLine[]> {
  const rows = await executor
    .select({
      variantId: cartItems.variantId,
      sku: productVariants.sku,
      priceCents: productVariants.priceCents,
      variantStatus: productVariants.status,
      attributes: productVariants.attributes,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productStatus: products.status,
      quantity: cartItems.quantity,
      mediaObjectKey: mediaAssets.objectKey,
      mediaAltText: mediaAssets.altText,
      mediaWidth: mediaAssets.width,
      mediaHeight: mediaAssets.height,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    // Falls back to the product's first global photo when no primary is designated, so a cart
    // line shows the same image the catalog grid and the menu already resolve for it.
    .leftJoin(
      mediaAssets,
      and(
        sql`${mediaAssets.id} = COALESCE(
          ${products.primaryMediaId},
          (
            SELECT a.id
            FROM product_media pm
            JOIN media_assets a ON a.id = pm.media_asset_id
            WHERE pm.product_id = ${products.id}
              AND pm.placement = 'GALLERY'
              AND a.security_class = 'PUBLIC_MEDIA'
              AND a.media_type = 'IMAGE'
            ORDER BY (pm.variant_id IS NULL) DESC, pm.display_order ASC, pm.created_at ASC
            LIMIT 1
          )
        )`,
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    )
    .where(eq(cartItems.cartId, cartId))
    .orderBy(cartItems.createdAt);

  return rows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    priceCents: r.priceCents,
    variantStatus: r.variantStatus,
    attributes: r.attributes,
    productId: r.productId,
    productSlug: r.productSlug,
    productName: r.productName,
    productStatus: r.productStatus,
    quantity: r.quantity,
    mediaObjectKey: r.mediaObjectKey,
    mediaAltText: r.mediaAltText,
    mediaWidth: r.mediaWidth,
    mediaHeight: r.mediaHeight,
  }));
}
