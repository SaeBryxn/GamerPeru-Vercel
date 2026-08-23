"use server";

import { getCurrentCart } from "./read";
import type { CartReadResult } from "./types";

/**
 * Dedicated zero-argument Server Function bridging post-hydration client state
 * to the canonical server-side Cart read runtime.
 */
export async function loadCurrentCartAction(): Promise<CartReadResult> {
  return getCurrentCart();
}
