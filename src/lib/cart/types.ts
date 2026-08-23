/**
 * Gamer Perú — Public Cart Types & Data Transfer Objects
 *
 * Exposes consumer-safe representations of Cart and CartLine aggregates.
 * Invariant: Internal database identifiers, customer profile IDs, session tokens,
 * and lifecycle metadata are strictly excluded from public DTOs.
 */

export interface CartMediaSnapshot {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface CartLineSnapshot {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  selectedAttributes: Record<string, string>;
  unitPriceCents: number;
  quantity: number;
  lineSubtotalCents: number;
  available: boolean;
  primaryMedia: CartMediaSnapshot | null;
}

export interface CartSnapshot {
  currency: "PEN";
  lineCount: number;
  itemCount: number;
  subtotalCents: number;
  hasUnavailableItems: boolean;
  lines: CartLineSnapshot[];
}

export type CartErrorCode =
  | "UNAUTHORIZED"
  | "PROFILE_REQUIRED"
  | "INVALID_INPUT"
  | "ITEM_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "EXCEEDS_MAX_QUANTITY"
  | "SYSTEM_ERROR";

export type CartReadResult =
  | {
      success: true;
      cart: CartSnapshot;
    }
  | {
      success: false;
      code: "PROFILE_REQUIRED";
      error: string;
    };

export type CartActionResult =
  | {
      success: true;
      cart: CartSnapshot;
      message?: string;
    }
  | {
      success: false;
      error: string;
      code: CartErrorCode;
      cart?: CartSnapshot;
    };

export interface AddCartItemInput {
  variantId: string;
  quantity?: number;
}

export interface UpdateCartItemQuantityInput {
  variantId: string;
  quantity: number;
}

export interface RemoveCartItemInput {
  variantId: string;
}
