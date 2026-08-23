"use server";

import { getCurrentCart } from "./read";
import type { CartReadResult } from "./types";

/**
 * Dedicated zero-argument Server Function bridging post-hydration client state
 * to the canonical server-side Cart read runtime.
 */
export async function loadCurrentCartAction(): Promise<CartReadResult> {
  if (process.env.E2E_CATALOG_FIXTURES === "1" && process.env.CART_E2E_FIXTURES !== "1") {
    return {
      success: true,
      cart: {
        currency: "PEN",
        lineCount: 0,
        itemCount: 0,
        subtotalCents: 0,
        hasUnavailableItems: false,
        lines: [],
      },
    };
  }

  return getCurrentCart();
}
