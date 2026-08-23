"use server";

import {
  addCartItemAction as addCartItemServiceAction,
  getCurrentCart as getCurrentCartService,
  removeCartItemAction as removeCartItemServiceAction,
  updateCartItemQuantityAction as updateCartItemQuantityServiceAction,
} from "./service";
import type {
  AddCartItemInput,
  CartActionResult,
  CartSnapshot,
  RemoveCartItemInput,
  UpdateCartItemQuantityInput,
} from "./types";

/**
 * Server Action to add an item or increment quantity in the authoritative Cart.
 */
export async function addCartItemAction(
  prevState: unknown,
  formData: FormData | AddCartItemInput
): Promise<CartActionResult> {
  return addCartItemServiceAction(prevState, formData);
}

/**
 * Server Action to update the target quantity of an existing line item in the Cart.
 */
export async function updateCartItemQuantityAction(
  prevState: unknown,
  formData: FormData | UpdateCartItemQuantityInput
): Promise<CartActionResult> {
  return updateCartItemQuantityServiceAction(prevState, formData);
}

/**
 * Server Action to remove a line item from the authoritative Cart.
 */
export async function removeCartItemAction(
  prevState: unknown,
  formData: FormData | RemoveCartItemInput
): Promise<CartActionResult> {
  return removeCartItemServiceAction(prevState, formData);
}

/**
 * Server-side read function for retrieving current authoritative CartSnapshot.
 */
export async function getCurrentCart(): Promise<CartSnapshot> {
  return getCurrentCartService();
}
