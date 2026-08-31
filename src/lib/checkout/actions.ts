"use server";

import { loadCheckoutConfirmation, loadCheckoutContext, submitCheckout } from "./service";
import type { CheckoutConfirmationResult, CheckoutContextDTO, CheckoutSubmitResult } from "./types";

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

/**
 * Server Action to load order confirmation for authorized customer or guest.
 */
export async function loadCheckoutConfirmationAction(
  orderNumber: string
): Promise<CheckoutConfirmationResult> {
  return await loadCheckoutConfirmation(orderNumber);
}
