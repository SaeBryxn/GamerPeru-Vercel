import { ANONYMOUS_TOKEN_REGEX, MAX_CART_LINE_QUANTITY, MIN_CART_LINE_QUANTITY } from "./constants";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Validates a variant ID as a valid RFC 9562 UUID (v4 or v7).
 */
export function validateVariantId(input: unknown): ValidationResult<string> {
  if (typeof input !== "string" || !input.trim()) {
    return { success: false, error: "El identificador de variante es requerido." };
  }

  const trimmed = input.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return { success: false, error: "El identificador de variante tiene un formato inválido." };
  }

  return { success: true, data: trimmed };
}

/**
 * Validates add-to-cart line quantity.
 * Allows optional quantity (defaults to 1).
 * Rejects 0, negatives, non-integers, and values > 10.
 */
export function validateAddQuantity(input: unknown): ValidationResult<number> {
  if (input === undefined || input === null || input === "") {
    return { success: true, data: 1 };
  }

  let num: number;
  if (typeof input === "number") {
    num = input;
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return { success: false, error: "La cantidad debe ser un número entero." };
    }
    num = parseInt(trimmed, 10);
  } else {
    return { success: false, error: "La cantidad debe ser un número entero." };
  }

  if (!Number.isInteger(num)) {
    return { success: false, error: "La cantidad debe ser un número entero." };
  }

  if (num < MIN_CART_LINE_QUANTITY || num > MAX_CART_LINE_QUANTITY) {
    return {
      success: false,
      error: `La cantidad debe estar entre ${MIN_CART_LINE_QUANTITY} y ${MAX_CART_LINE_QUANTITY} unidades.`,
    };
  }

  return { success: true, data: num };
}

/**
 * Validates update-quantity line target quantity.
 * Must be explicit integer between 1 and 10.
 * Invariant: Quantity 0 is NOT removal; must be rejected.
 */
export function validateUpdateQuantity(input: unknown): ValidationResult<number> {
  if (input === undefined || input === null || input === "") {
    return { success: false, error: "La cantidad es requerida." };
  }

  let num: number;
  if (typeof input === "number") {
    num = input;
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return { success: false, error: "La cantidad debe ser un número entero." };
    }
    num = parseInt(trimmed, 10);
  } else {
    return { success: false, error: "La cantidad debe ser un número entero." };
  }

  if (!Number.isInteger(num)) {
    return { success: false, error: "La cantidad debe ser un número entero." };
  }

  if (num < MIN_CART_LINE_QUANTITY || num > MAX_CART_LINE_QUANTITY) {
    return {
      success: false,
      error: `La cantidad debe estar entre ${MIN_CART_LINE_QUANTITY} y ${MAX_CART_LINE_QUANTITY} unidades.`,
    };
  }

  return { success: true, data: num };
}

/**
 * Validates anonymous session token against 256-bit base64url 43-character specification.
 */
export function validateSessionToken(token: unknown): boolean {
  if (typeof token !== "string") {
    return false;
  }
  return ANONYMOUS_TOKEN_REGEX.test(token.trim());
}

/**
 * Parses raw input from FormData or plain Object for AddCartItem.
 */
export function parseAddCartItemInput(raw: unknown): { variantId: unknown; quantity: unknown } {
  if (raw instanceof FormData) {
    return {
      variantId: raw.get("variantId"),
      quantity: raw.get("quantity"),
    };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      variantId: obj.variantId,
      quantity: obj.quantity,
    };
  }
  return { variantId: undefined, quantity: undefined };
}

/**
 * Parses raw input from FormData or plain Object for UpdateCartItemQuantity.
 */
export function parseUpdateCartItemQuantityInput(raw: unknown): {
  variantId: unknown;
  quantity: unknown;
} {
  if (raw instanceof FormData) {
    return {
      variantId: raw.get("variantId"),
      quantity: raw.get("quantity"),
    };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      variantId: obj.variantId,
      quantity: obj.quantity,
    };
  }
  return { variantId: undefined, quantity: undefined };
}

/**
 * Parses raw input from FormData or plain Object for RemoveCartItem.
 */
export function parseRemoveCartItemInput(raw: unknown): { variantId: unknown } {
  if (raw instanceof FormData) {
    return {
      variantId: raw.get("variantId"),
    };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      variantId: obj.variantId,
    };
  }
  return { variantId: undefined };
}
