"use server";

import { loadCheckoutContext, submitCheckout } from "./service";
import type { CheckoutContextDTO, CheckoutSubmitResult } from "./types";

/**
 * Server Action to load current checkout context and configuration options.
 */
export async function loadCheckoutContextAction(): Promise<CheckoutContextDTO> {
  return await loadCheckoutContext();
}

/**
 * Server Action to submit an atomic checkout purchase.
 */
export async function submitCheckoutAction(input: unknown): Promise<CheckoutSubmitResult> {
  return await submitCheckout(input);
}
