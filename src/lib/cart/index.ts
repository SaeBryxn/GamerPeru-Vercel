/**
 * Gamer Perú — Canonical Cart Module
 *
 * Public entry point for server-side Cart aggregate operations, types, and validation.
 */

export {
  addCartItemAction,
  updateCartItemQuantityAction,
  removeCartItemAction,
  getCurrentCart,
} from "./actions";

export {
  ANONYMOUS_CART_COOKIE_NAME_DEV,
  ANONYMOUS_CART_COOKIE_NAME_PROD,
  CART_COOKIE_MAX_AGE_SECONDS,
  ANONYMOUS_CART_TTL_DAYS,
  AUTHENTICATED_CART_TTL_DAYS,
  MIN_CART_LINE_QUANTITY,
  MAX_CART_LINE_QUANTITY,
  CANONICAL_CART_CURRENCY,
} from "./constants";

export type {
  CartSnapshot,
  CartLineSnapshot,
  CartMediaSnapshot,
  CartActionResult,
  CartErrorCode,
  AddCartItemInput,
  UpdateCartItemQuantityInput,
  RemoveCartItemInput,
} from "./types";

export {
  validateVariantId,
  validateAddQuantity,
  validateUpdateQuantity,
  validateSessionToken,
} from "./validation";
