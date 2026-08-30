import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, productVariants, products } from "@/db/schema";
import { logger } from "@/lib/logger";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import {
  ANONYMOUS_CART_TTL_MS,
  AUTHENTICATED_CART_TTL_MS,
  CANONICAL_CART_CURRENCY,
} from "./constants";
import type { CartHydrationLine } from "./internal-types";
import {
  atomicAddCartLine,
  atomicRemoveCartLine,
  atomicUpdateCartLine,
  getOrCreateActiveCart,
  mergeGuestCartIntoAuthenticated,
  queryCartHydrationLines,
  refreshCartTtl,
  resolveAnonymousMutationCart,
  resolveExistingAnonymousMutationCart,
  retireCartById,
} from "./persistence";
import { clearAnonymousCartCookie, resolveCartAuthority, setAnonymousCartCookie } from "./session";
import type {
  AddCartItemInput,
  CartActionResult,
  CartLineSnapshot,
  CartReadResult,
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
 * Passive read for the current Cart.
 *
 * Invariants:
 * 1. Passive Read Zero State: Unauthenticated read without cookie/cart creates 0 rows, 0 cookies, 0 TTL refreshes.
 * 2. Lazy Merge Trigger: If authenticated user carries guest cookie, merges within transaction.
 * 3. Typed Fail-Closed: Returns typed PROFILE_REQUIRED for AUTHENTICATED_PROFILE_REQUIRED state.
 * 4. Fresh Prices: Queries live product_variants.price_cents.
 */
export async function getCurrentCart(): Promise<CartReadResult> {
  const authority = await resolveCartAuthority();

  if (authority.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      error: "Debes completar tu perfil para usar el carrito de compras.",
    };
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
      return { success: true, cart: createEmptyCartSnapshot() };
    }

    const lines = await queryCartHydrationLines(authCart.id);
    return { success: true, cart: buildCartSnapshot(lines) };
  }

  // UNAUTHENTICATED Passive Read
  if (!authority.guestToken || authority.isMalformedGuest) {
    return { success: true, cart: createEmptyCartSnapshot() };
  }

  const [guestCart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, authority.guestToken), eq(carts.status, "ACTIVE")))
    .limit(1);

  if (!guestCart || guestCart.expiresAt < new Date()) {
    return { success: true, cart: createEmptyCartSnapshot() };
  }

  const lines = await queryCartHydrationLines(guestCart.id);
  return { success: true, cart: buildCartSnapshot(lines) };
}

/**
 * Adds an item or increments an existing line item in the authoritative Cart.
 *
 * Invariants:
 * 1. Eligibility Check: products.status = PUBLISHED AND product_variants.status = ACTIVE.
 * 2. Zero Inventory Queries: Stock is decoupled from cart runtime (GP-021).
 * 3. Atomic UPSERT: LEAST(quantity + EXCLUDED.quantity, 10).
 * 4. Sliding TTL: +30 days for anonymous (DB + cookie), +60 days for authenticated.
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

  try {
    if (authority.status === "AUTHENTICATED_WITH_PROFILE") {
      // First authenticated access guest merge handling
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

      // Catalog Eligibility Verification
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

      const snapshot = await db.transaction(async (tx) => {
        const authCart = await getOrCreateActiveCart(
          {
            type: "AUTHENTICATED",
            customerProfileId: authority.customerProfileId,
            authUserId: authority.authUserId,
          },
          tx
        );

        await atomicAddCartLine(authCart.id, variantId, quantityToAdd, tx);
        await refreshCartTtl(authCart.id, AUTHENTICATED_CART_TTL_MS, tx);

        const lines = await queryCartHydrationLines(authCart.id, tx);
        return buildCartSnapshot(lines);
      });

      return {
        success: true,
        cart: snapshot,
        message: "Producto agregado al carrito.",
      };
    }

    // UNAUTHENTICATED Flow: Catalog Eligibility Verification First
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

    let authoritativeToken = "";
    const snapshot = await db.transaction(async (tx) => {
      const resolution = await resolveAnonymousMutationCart(
        authority.guestToken,
        authority.isMalformedGuest,
        tx
      );

      authoritativeToken = resolution.authoritativeToken;

      await atomicAddCartLine(resolution.cart.id, variantId, quantityToAdd, tx);
      await refreshCartTtl(resolution.cart.id, ANONYMOUS_CART_TTL_MS, tx);

      const lines = await queryCartHydrationLines(resolution.cart.id, tx);
      return buildCartSnapshot(lines);
    });

    // Re-set or set cookie after successful commit to slide cookie maxAge
    await setAnonymousCartCookie(authoritativeToken);

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
 * 3. Sliding TTL: Refreshes DB TTL and cookie maxAge upon successful update.
 * 4. Expired Cart: Retires expired Cart to ABANDONED transactionally without modifying lines.
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

      const result = await db.transaction(async (tx) => {
        const [authCart] = await tx
          .select()
          .from(carts)
          .where(and(eq(carts.customerId, authority.customerProfileId), eq(carts.status, "ACTIVE")))
          .for("update")
          .limit(1);

        if (!authCart) {
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El carrito no fue encontrado o ha expirado.",
          };
        }

        if (authCart.expiresAt < new Date()) {
          await retireCartById(authCart.id, tx);
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

        await atomicUpdateCartLine(authCart.id, variantId, targetQuantity, tx);
        await refreshCartTtl(authCart.id, AUTHENTICATED_CART_TTL_MS, tx);

        const lines = await queryCartHydrationLines(authCart.id, tx);
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
      const cartRes = await resolveExistingAnonymousMutationCart(
        authority.guestToken,
        authority.isMalformedGuest,
        tx
      );

      if (!cartRes.success) {
        return cartRes;
      }

      const anonCart = cartRes.cart;

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

      await atomicUpdateCartLine(anonCart.id, variantId, targetQuantity, tx);
      await refreshCartTtl(anonCart.id, ANONYMOUS_CART_TTL_MS, tx);

      const lines = await queryCartHydrationLines(anonCart.id, tx);
      return {
        success: true as const,
        cart: buildCartSnapshot(lines),
      };
    });

    if (!result.success) {
      return result;
    }

    // Refresh anonymous cookie maxAge after successful commit
    await setAnonymousCartCookie(authority.guestToken);

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
 * 3. Sliding TTL: Refreshes TTL only when a line item was actually deleted.
 * 4. Missing Line No-Op: Does not refresh DB TTL or cookie maxAge.
 * 5. Expired Cart: Retires expired Cart to ABANDONED transactionally without modifying lines.
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

      const result = await db.transaction(async (tx) => {
        const [authCart] = await tx
          .select()
          .from(carts)
          .where(and(eq(carts.customerId, authority.customerProfileId), eq(carts.status, "ACTIVE")))
          .for("update")
          .limit(1);

        if (!authCart) {
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El carrito no fue encontrado o ha expirado.",
          };
        }

        if (authCart.expiresAt < new Date()) {
          await retireCartById(authCart.id, tx);
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El carrito no fue encontrado o ha expirado.",
          };
        }

        const wasRemoved = await atomicRemoveCartLine(authCart.id, variantId, tx);
        if (!wasRemoved) {
          return {
            success: false as const,
            code: "ITEM_NOT_FOUND" as const,
            error: "El producto no se encuentra en el carrito.",
          };
        }

        await refreshCartTtl(authCart.id, AUTHENTICATED_CART_TTL_MS, tx);
        const lines = await queryCartHydrationLines(authCart.id, tx);
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
        message: "Producto eliminado del carrito.",
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
      const cartRes = await resolveExistingAnonymousMutationCart(
        authority.guestToken,
        authority.isMalformedGuest,
        tx
      );

      if (!cartRes.success) {
        return cartRes;
      }

      const anonCart = cartRes.cart;

      const wasRemoved = await atomicRemoveCartLine(anonCart.id, variantId, tx);
      if (!wasRemoved) {
        return {
          success: false as const,
          code: "ITEM_NOT_FOUND" as const,
          error: "El producto no se encuentra en el carrito.",
        };
      }

      await refreshCartTtl(anonCart.id, ANONYMOUS_CART_TTL_MS, tx);
      const lines = await queryCartHydrationLines(anonCart.id, tx);
      return {
        success: true as const,
        cart: buildCartSnapshot(lines),
      };
    });

    if (!result.success) {
      return result;
    }

    // Refresh anonymous cookie maxAge after successful deletion commit
    await setAnonymousCartCookie(authority.guestToken);

    return {
      success: true,
      cart: result.cart,
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
