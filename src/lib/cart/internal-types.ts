import "server-only";
import type { Cart, CartItem } from "@/db/schema";

/**
 * Gamer Perú — Internal Cart Types & Server State
 *
 * Types for internal database resolution, session authority, and transactional processing.
 * Strictly restricted to server runtime execution.
 */

export type CartOwner =
  | {
      type: "ANONYMOUS";
      sessionToken: string;
    }
  | {
      type: "AUTHENTICATED";
      customerProfileId: string;
      authUserId: string;
    };

export type CartAuthority =
  | {
      status: "UNAUTHENTICATED";
      guestToken: string | null;
      isMalformedGuest: boolean;
    }
  | {
      status: "AUTHENTICATED_WITH_PROFILE";
      customerProfileId: string;
      authUserId: string;
      guestToken: string | null;
      isMalformedGuest: boolean;
    }
  | {
      status: "AUTHENTICATED_PROFILE_REQUIRED";
      authUserId: string;
    };

export type CartDatabaseRow = Cart;
export type CartItemDatabaseRow = CartItem;

export interface CartHydrationLine {
  variantId: string;
  sku: string;
  priceCents: number;
  variantStatus: string;
  attributes: Record<string, string>;
  productId: string;
  productSlug: string;
  productName: string;
  productStatus: string;
  quantity: number;
  /** Units left to sell: on hand minus reserved and allocated, across every inventory location. */
  availableUnits: number;
  mediaObjectKey: string | null;
  mediaAltText: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
}
