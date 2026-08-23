import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, mediaAssets, productVariants, products, type Cart } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { logger } from "@/lib/logger";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import {
  ANONYMOUS_CART_TTL_MS,
  AUTHENTICATED_CART_TTL_MS,
  CANONICAL_CART_CURRENCY,
  MAX_CART_LINE_QUANTITY,
} from "./constants";
import type { CartHydrationLine, CartOwner } from "./internal-types";
import {
  clearAnonymousCartCookie,
  generateAnonymousSessionToken,
  resolveCartAuthority,
  setAnonymousCartCookie,
} from "./session";
import type {
  AddCartItemInput,
  CartActionResult,
  CartLineSnapshot,
  CartSnapshot,
  RemoveCartItemInput,
  UpdateCartItemQuantityInput,
} from "./types";
import {
  parseAddCartItemInput,
  parseRemoveCartItemInput,
  parseUpdateCartItemQuantityInput,
  validateAddQuantity,
  validateUpdateQuantity,
  validateVariantId,
} from "./validation";

type DatabaseExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Creates an empty canonical CartSnapshot.
 */
export function createEmptyCartSnapshot(): CartSnapshot {
  return {
    currency: CANONICAL_CART_CURRENCY,
    lineCount: 0,
    itemCount: 0,
    subtotalCents: 0,
    hasUnavailableItems: false,
    lines: [],
  };
}

/**
 * Transforms raw hydrated database rows into a public CartSnapshot DTO.
 *
 * Invariants:
 * 1. Price Authority: Live product_variants.price_cents governs line totals.
 * 2. Integer Minor Units: lineSubtotalCents = unitPriceCents * quantity.
 * 3. Availability: available = true strictly when product is PUBLISHED and variant is ACTIVE.
 * 4. DTO Privacy: Excludes database IDs, customer/owner references, and session tokens.
 */
export function buildCartSnapshot(lines: CartHydrationLine[]): CartSnapshot {
  const lineSnapshots: CartLineSnapshot[] = lines.map((line) => {
    const isAvailable = line.productStatus === "PUBLISHED" && line.variantStatus === "ACTIVE";
    const lineSubtotalCents = line.priceCents * line.quantity;
    const mediaUrl = resolvePublicMediaUrl(line.mediaObjectKey);

    return {
      variantId: line.variantId,
      sku: line.sku,
      productSlug: line.productSlug,
      productName: line.productName,
      selectedAttributes: line.attributes ?? {},
      unitPriceCents: line.priceCents,
      quantity: line.quantity,
      lineSubtotalCents,
      available: isAvailable,
      primaryMedia: mediaUrl
        ? {
            url: mediaUrl,
            altText: line.mediaAltText,
            width: line.mediaWidth,
            height: line.mediaHeight,
          }
        : null,
    };
  });

  const lineCount = lineSnapshots.length;
  const itemCount = lineSnapshots.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = lineSnapshots.reduce((sum, line) => sum + line.lineSubtotalCents, 0);
  const hasUnavailableItems = lineSnapshots.some((line) => !line.available);

  return {
    currency: CANONICAL_CART_CURRENCY,
    lineCount,
    itemCount,
    subtotalCents,
    hasUnavailableItems,
    lines: lineSnapshots,
  };
}

/**
 * Queries and joins line items for a given cart ID with catalog status and primary media.
 */
async function queryCartHydrationLines(
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
    .leftJoin(mediaAssets, eq(products.primaryMediaId, mediaAssets.id))
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

/**
 * Safely resolves or creates an ACTIVE Cart for the given owner within a transaction.
 *
 * Concurrency & Expiry Handling:
 * 1. Locks existing ACTIVE row (if present).
 * 2. If row is expired (expires_at < NOW()), transitions ACTIVE -> ABANDONED.
 * 3. Attempts conflict-safe INSERT with ON CONFLICT DO NOTHING.
 * 4. If INSERT loses a race, re-queries and locks the authoritative winning ACTIVE cart.
 */
async function getOrCreateActiveCart(owner: CartOwner, executor: DatabaseExecutor): Promise<Cart> {
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
        await executor
          .update(carts)
          .set({ status: "ABANDONED", updatedAt: now })
          .where(eq(carts.id, activeCart.id));
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
      .onConflictDoNothing({ target: carts.customerId, where: sql`${carts.status} = 'ACTIVE'` })
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
      await executor
        .update(carts)
        .set({ status: "ABANDONED", updatedAt: now })
        .where(eq(carts.id, activeCart.id));
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
    .onConflictDoNothing({ target: carts.sessionToken, where: sql`${carts.status} = 'ACTIVE'` })
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
    await executor
      .update(carts)
      .set({ status: "ABANDONED", updatedAt: now })
      .where(eq(carts.id, guestCart.id));

    return { merged: false, shouldClearCookie: true };
  }

  const guestLines = await executor
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, guestCart.id))
    .for("update");

  if (guestLines.length === 0) {
    await executor
      .update(carts)
      .set({ status: "ABANDONED", updatedAt: now })
      .where(eq(carts.id, guestCart.id));

    return { merged: false, shouldClearCookie: true };
  }

  const authCart = await getOrCreateActiveCart(
    { type: "AUTHENTICATED", customerProfileId, authUserId: "" },
    executor
  );

  for (const line of guestLines) {
    await executor
      .insert(cartItems)
      .values({
        id: generateUuidV7(),
        cartId: authCart.id,
        variantId: line.variantId,
        quantity: line.quantity,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: {
          quantity: sql`LEAST(${cartItems.quantity} + ${line.quantity}, ${MAX_CART_LINE_QUANTITY})`,
          updatedAt: now,
        },
      });
  }

  const newAuthExpiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
  await executor
    .update(carts)
    .set({
      expiresAt: newAuthExpiresAt,
      updatedAt: now,
    })
    .where(eq(carts.id, authCart.id));

  await executor
    .update(carts)
    .set({
      status: "ABANDONED",
      updatedAt: now,
    })
    .where(eq(carts.id, guestCart.id));

  return { merged: true, shouldClearCookie: true };
}

/**
 * Passive read for the current Cart.
 *
 * Invariants:
 * 1. Passive Read Zero State: Unauthenticated read without cookie/cart creates 0 rows, 0 cookies.
 * 2. Lazy Merge Trigger: If authenticated user carries guest cookie, merges within transaction.
 * 3. Fresh Prices: Queries live product_variants.price_cents.
 */
export async function getCurrentCart(): Promise<CartSnapshot> {
  const authority = await resolveCartAuthority();

  if (authority.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return createEmptyCartSnapshot();
  }

  if (authority.status === "AUTHENTICATED_WITH_PROFILE") {
    if (authority.guestToken) {
      try {
        const mergeResult = await db.transaction(async (tx) => {
          return mergeGuestCartIntoAuthenticated(
            authority.customerProfileId,
            authority.guestToken!,
            tx
          );
        });

        if (mergeResult.shouldClearCookie) {
          await clearAnonymousCartCookie();
        }
      } catch {
        logger.error({ event: "cart_guest_merge_failed" });
      }
    } else if (authority.isMalformedGuest) {
      await clearAnonymousCartCookie();
    }

    const [authCart] = await db
      .select()
      .from(carts)
      .where(and(eq(carts.customerId, authority.customerProfileId), eq(carts.status, "ACTIVE")))
      .limit(1);

    if (!authCart || authCart.expiresAt < new Date()) {
      return createEmptyCartSnapshot();
    }

    const lines = await queryCartHydrationLines(authCart.id);
    return buildCartSnapshot(lines);
  }

  // UNAUTHENTICATED Passive Read
  if (!authority.guestToken || authority.isMalformedGuest) {
    return createEmptyCartSnapshot();
  }

  const [guestCart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, authority.guestToken), eq(carts.status, "ACTIVE")))
    .limit(1);

  if (!guestCart || guestCart.expiresAt < new Date()) {
    return createEmptyCartSnapshot();
  }

  const lines = await queryCartHydrationLines(guestCart.id);
  return buildCartSnapshot(lines);
}

/**
 * Adds an item or increments an existing line item in the authoritative Cart.
 *
 * Invariants:
 * 1. Eligibility Check: products.status = PUBLISHED AND product_variants.status = ACTIVE.
 * 2. Zero Inventory Queries: Stock is decoupled from cart runtime (GP-021).
 * 3. Atomic UPSERT: LEAST(quantity + EXCLUDED.quantity, 10).
 * 4. Sliding TTL: +30 days for anonymous, +60 days for authenticated.
 * 5. Session Fixation Defense: Unauthenticated mutations generate fresh server tokens.
 */
export async function addCartItemAction(
  _prevState: unknown,
  formData: FormData | AddCartItemInput
): Promise<CartActionResult> {
  const rawInput = parseAddCartItemInput(formData);
  const variantValidation = validateVariantId(rawInput.variantId);
  if (!variantValidation.success) {
    return { success: false, code: "INVALID_INPUT", error: variantValidation.error };
  }

  const quantityValidation = validateAddQuantity(rawInput.quantity);
  if (!quantityValidation.success) {
    return { success: false, code: "INVALID_INPUT", error: quantityValidation.error };
  }

  const variantId = variantValidation.data;
  const quantityToAdd = quantityValidation.data;

  const authority = await resolveCartAuthority();
  if (authority.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      error: "Debes completar tu perfil para usar el carrito de compras.",
    };
  }

  // Catalog Eligibility Verification (Direct PostgreSQL query; zero inventory query)
  const [variantRow] = await db
    .select({
      variantId: productVariants.id,
      variantStatus: productVariants.status,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (!variantRow) {
    return {
      success: false,
      code: "ITEM_NOT_FOUND",
      error: "El producto seleccionado no existe o fue retirado.",
    };
  }

  if (variantRow.productStatus !== "PUBLISHED" || variantRow.variantStatus !== "ACTIVE") {
    return {
      success: false,
      code: "PRODUCT_UNAVAILABLE",
      error: "El producto seleccionado no está disponible para compra.",
    };
  }

  try {
    if (authority.status === "AUTHENTICATED_WITH_PROFILE") {
      let shouldClearGuest = false;

      const snapshot = await db.transaction(async (tx) => {
        if (authority.guestToken) {
          const mergeResult = await mergeGuestCartIntoAuthenticated(
            authority.customerProfileId,
            authority.guestToken,
            tx
          );
          if (mergeResult.shouldClearCookie) {
            shouldClearGuest = true;
          }
        }

        const authCart = await getOrCreateActiveCart(
          {
            type: "AUTHENTICATED",
            customerProfileId: authority.customerProfileId,
            authUserId: authority.authUserId,
          },
          tx
        );

        const now = new Date();
        await tx
          .insert(cartItems)
          .values({
            id: generateUuidV7(),
            cartId: authCart.id,
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

        const newExpiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
        await tx
          .update(carts)
          .set({ expiresAt: newExpiresAt, updatedAt: now })
          .where(eq(carts.id, authCart.id));

        const lines = await queryCartHydrationLines(authCart.id, tx);
        return buildCartSnapshot(lines);
      });

      if (shouldClearGuest || authority.isMalformedGuest) {
        await clearAnonymousCartCookie();
      }

      return {
        success: true,
        cart: snapshot,
        message: "Producto agregado al carrito.",
      };
    }

    // UNAUTHENTICATED Flow
    let tokenToUse: string;
    let isNewToken = false;

    if (!authority.guestToken || authority.isMalformedGuest) {
      tokenToUse = generateAnonymousSessionToken();
      isNewToken = true;
    } else {
      const [existingActive] = await db
        .select({ id: carts.id, expiresAt: carts.expiresAt })
        .from(carts)
        .where(and(eq(carts.sessionToken, authority.guestToken), eq(carts.status, "ACTIVE")))
        .limit(1);

      if (!existingActive || existingActive.expiresAt < new Date()) {
        tokenToUse = generateAnonymousSessionToken();
        isNewToken = true;
      } else {
        tokenToUse = authority.guestToken;
      }
    }

    const snapshot = await db.transaction(async (tx) => {
      const anonCart = await getOrCreateActiveCart(
        { type: "ANONYMOUS", sessionToken: tokenToUse },
        tx
      );

      const now = new Date();
      await tx
        .insert(cartItems)
        .values({
          id: generateUuidV7(),
          cartId: anonCart.id,
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

      const newExpiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
      await tx
        .update(carts)
        .set({ expiresAt: newExpiresAt, updatedAt: now })
        .where(eq(carts.id, anonCart.id));

      const lines = await queryCartHydrationLines(anonCart.id, tx);
      return buildCartSnapshot(lines);
    });

    if (isNewToken || authority.guestToken !== tokenToUse) {
      await setAnonymousCartCookie(tokenToUse);
    }

    return {
      success: true,
      cart: snapshot,
      message: "Producto agregado al carrito.",
    };
  } catch {
    logger.error({ event: "cart_add_item_failed" });
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Ocurrió un error al agregar el producto al carrito. Intenta nuevamente.",
    };
  }
}

/**
 * Updates the quantity of an existing line item in the authoritative Cart.
 *
 * Invariants:
 * 1. Target bounds: Strict integer 1..10 (0 rejected).
 * 2. Eligibility: Unavailable items (DRAFT/ARCHIVED product or INACTIVE variant) reject quantity updates.
 * 3. Sliding TTL: Refreshes TTL upon successful update.
 */
export async function updateCartItemQuantityAction(
  _prevState: unknown,
  formData: FormData | UpdateCartItemQuantityInput
): Promise<CartActionResult> {
  const rawInput = parseUpdateCartItemQuantityInput(formData);
  const variantValidation = validateVariantId(rawInput.variantId);
  if (!variantValidation.success) {
    return { success: false, code: "INVALID_INPUT", error: variantValidation.error };
  }

  const quantityValidation = validateUpdateQuantity(rawInput.quantity);
  if (!quantityValidation.success) {
    return { success: false, code: "INVALID_INPUT", error: quantityValidation.error };
  }

  const variantId = variantValidation.data;
  const targetQuantity = quantityValidation.data;

  const authority = await resolveCartAuthority();
  if (authority.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      error: "Debes completar tu perfil para usar el carrito de compras.",
    };
  }

  try {
    if (authority.status === "AUTHENTICATED_WITH_PROFILE") {
      let shouldClearGuest = false;

      const result = await db.transaction(async (tx) => {
        if (authority.guestToken) {
          const mergeResult = await mergeGuestCartIntoAuthenticated(
            authority.customerProfileId,
            authority.guestToken,
            tx
          );
          if (mergeResult.shouldClearCookie) {
            shouldClearGuest = true;
          }
        }

        const [authCart] = await tx
          .select()
          .from(carts)
          .where(and(eq(carts.customerId, authority.customerProfileId), eq(carts.status, "ACTIVE")))
          .for("update")
          .limit(1);

        if (!authCart || authCart.expiresAt < new Date()) {
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El carrito no fue encontrado o ha expirado.",
          };
        }

        const [item] = await tx
          .select({
            id: cartItems.id,
            variantStatus: productVariants.status,
            productStatus: products.status,
          })
          .from(cartItems)
          .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(and(eq(cartItems.cartId, authCart.id), eq(cartItems.variantId, variantId)))
          .for("update")
          .limit(1);

        if (!item) {
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El producto no se encuentra en el carrito.",
          };
        }

        if (item.productStatus !== "PUBLISHED" || item.variantStatus !== "ACTIVE") {
          return {
            success: false as const,
            code: "PRODUCT_UNAVAILABLE" as const,
            error: "No se puede modificar la cantidad de un producto no disponible.",
          };
        }

        const now = new Date();
        await tx
          .update(cartItems)
          .set({ quantity: targetQuantity, updatedAt: now })
          .where(and(eq(cartItems.cartId, authCart.id), eq(cartItems.variantId, variantId)));

        const newExpiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
        await tx
          .update(carts)
          .set({ expiresAt: newExpiresAt, updatedAt: now })
          .where(eq(carts.id, authCart.id));

        const lines = await queryCartHydrationLines(authCart.id, tx);
        return {
          success: true as const,
          cart: buildCartSnapshot(lines),
        };
      });

      if (shouldClearGuest || authority.isMalformedGuest) {
        await clearAnonymousCartCookie();
      }

      if (!result.success) {
        return result;
      }

      return {
        success: true,
        cart: result.cart,
        message: "Cantidad actualizada correctamente.",
      };
    }

    // UNAUTHENTICATED Flow
    if (!authority.guestToken || authority.isMalformedGuest) {
      return {
        success: false,
        code: "ITEM_NOT_FOUND",
        error: "El carrito no fue encontrado o ha expirado.",
      };
    }

    const result = await db.transaction(async (tx) => {
      const [anonCart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.sessionToken, authority.guestToken!), eq(carts.status, "ACTIVE")))
        .for("update")
        .limit(1);

      if (!anonCart || anonCart.expiresAt < new Date()) {
        return {
          success: false as const,
          code: "ITEM_NOT_FOUND" as const,
          error: "El carrito no fue encontrado o ha expirado.",
        };
      }

      const [item] = await tx
        .select({
          id: cartItems.id,
          variantStatus: productVariants.status,
          productStatus: products.status,
        })
        .from(cartItems)
        .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(and(eq(cartItems.cartId, anonCart.id), eq(cartItems.variantId, variantId)))
        .for("update")
        .limit(1);

      if (!item) {
        return {
          success: false as const,
          code: "ITEM_NOT_FOUND" as const,
          error: "El producto no se encuentra en el carrito.",
        };
      }

      if (item.productStatus !== "PUBLISHED" || item.variantStatus !== "ACTIVE") {
        return {
          success: false as const,
          code: "PRODUCT_UNAVAILABLE" as const,
          error: "No se puede modificar la cantidad de un producto no disponible.",
        };
      }

      const now = new Date();
      await tx
        .update(cartItems)
        .set({ quantity: targetQuantity, updatedAt: now })
        .where(and(eq(cartItems.cartId, anonCart.id), eq(cartItems.variantId, variantId)));

      const newExpiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
      await tx
        .update(carts)
        .set({ expiresAt: newExpiresAt, updatedAt: now })
        .where(eq(carts.id, anonCart.id));

      const lines = await queryCartHydrationLines(anonCart.id, tx);
      return {
        success: true as const,
        cart: buildCartSnapshot(lines),
      };
    });

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      cart: result.cart,
      message: "Cantidad actualizada correctamente.",
    };
  } catch {
    logger.error({ event: "cart_update_quantity_failed" });
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Ocurrió un error al actualizar la cantidad. Intenta nuevamente.",
    };
  }
}

/**
 * Removes a line item from the authoritative Cart.
 *
 * Invariants:
 * 1. Available & Unavailable Removal: Both available and unavailable lines may be removed.
 * 2. Cart Retention: Removing the final line does not delete the Cart entity.
 * 3. Sliding TTL: Refreshes TTL upon successful removal.
 */
export async function removeCartItemAction(
  _prevState: unknown,
  formData: FormData | RemoveCartItemInput
): Promise<CartActionResult> {
  const rawInput = parseRemoveCartItemInput(formData);
  const variantValidation = validateVariantId(rawInput.variantId);
  if (!variantValidation.success) {
    return { success: false, code: "INVALID_INPUT", error: variantValidation.error };
  }

  const variantId = variantValidation.data;

  const authority = await resolveCartAuthority();
  if (authority.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      error: "Debes completar tu perfil para usar el carrito de compras.",
    };
  }

  try {
    if (authority.status === "AUTHENTICATED_WITH_PROFILE") {
      let shouldClearGuest = false;

      const snapshot = await db.transaction(async (tx) => {
        if (authority.guestToken) {
          const mergeResult = await mergeGuestCartIntoAuthenticated(
            authority.customerProfileId,
            authority.guestToken,
            tx
          );
          if (mergeResult.shouldClearCookie) {
            shouldClearGuest = true;
          }
        }

        const [authCart] = await tx
          .select()
          .from(carts)
          .where(and(eq(carts.customerId, authority.customerProfileId), eq(carts.status, "ACTIVE")))
          .for("update")
          .limit(1);

        if (!authCart || authCart.expiresAt < new Date()) {
          return createEmptyCartSnapshot();
        }

        await tx
          .delete(cartItems)
          .where(and(eq(cartItems.cartId, authCart.id), eq(cartItems.variantId, variantId)));

        const now = new Date();
        const newExpiresAt = new Date(now.getTime() + AUTHENTICATED_CART_TTL_MS);
        await tx
          .update(carts)
          .set({ expiresAt: newExpiresAt, updatedAt: now })
          .where(eq(carts.id, authCart.id));

        const lines = await queryCartHydrationLines(authCart.id, tx);
        return buildCartSnapshot(lines);
      });

      if (shouldClearGuest || authority.isMalformedGuest) {
        await clearAnonymousCartCookie();
      }

      return {
        success: true,
        cart: snapshot,
        message: "Producto eliminado del carrito.",
      };
    }

    // UNAUTHENTICATED Flow
    if (!authority.guestToken || authority.isMalformedGuest) {
      return {
        success: true,
        cart: createEmptyCartSnapshot(),
        message: "Producto eliminado del carrito.",
      };
    }

    const snapshot = await db.transaction(async (tx) => {
      const [anonCart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.sessionToken, authority.guestToken!), eq(carts.status, "ACTIVE")))
        .for("update")
        .limit(1);

      if (!anonCart || anonCart.expiresAt < new Date()) {
        return createEmptyCartSnapshot();
      }

      await tx
        .delete(cartItems)
        .where(and(eq(cartItems.cartId, anonCart.id), eq(cartItems.variantId, variantId)));

      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + ANONYMOUS_CART_TTL_MS);
      await tx
        .update(carts)
        .set({ expiresAt: newExpiresAt, updatedAt: now })
        .where(eq(carts.id, anonCart.id));

      const lines = await queryCartHydrationLines(anonCart.id, tx);
      return buildCartSnapshot(lines);
    });

    return {
      success: true,
      cart: snapshot,
      message: "Producto eliminado del carrito.",
    };
  } catch {
    logger.error({ event: "cart_remove_item_failed" });
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Ocurrió un error al eliminar el producto del carrito. Intenta nuevamente.",
    };
  }
}
