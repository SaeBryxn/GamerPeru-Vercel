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

/** Minimal authorized status read: no address, email or signed media in polling responses. */
export async function loadOrderProgressAction(orderNumber: string) {
  const result = await loadCheckoutConfirmation(orderNumber);
  if (!result.success) return { success: false as const };
  const { status, paymentStatus, progress, reservationExpiresAt, serverNow } = result.confirmation;
  return {
    success: true as const,
    data: { status, paymentStatus, progress, reservationExpiresAt, serverNow },
  };
}
