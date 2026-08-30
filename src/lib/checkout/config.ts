import "server-only";

export interface CheckoutConfig {
  hmacSecret: string;
  primaryLocationCode: string;
  reservationTtlMinutes: number;
  idempotencyTtlMinutes: number;
}

export interface CheckoutConfigResult {
  valid: boolean;
  config?: CheckoutConfig;
  error?: string;
}

/**
 * Validates and resolves Checkout server runtime configuration.
 *
 * Invariants:
 * 1. Fail-closed: Returns invalid if any required configuration variable is missing or malformed.
 * 2. HMAC Secret: Must be at least 32 characters (256 bits).
 * 3. TTL Values: Must be positive finite integers.
 * 4. Location Code: Must be a non-empty string.
 * 5. Production Safe: Never logs or exposes secret credentials.
 */
export function getCheckoutConfig(): CheckoutConfigResult {
  const hmacSecret = process.env.CHECKOUT_HMAC_SECRET?.trim();
  const primaryLocationCode = process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE?.trim();
  const reservationTtlRaw = process.env.CHECKOUT_RESERVATION_TTL_MINUTES?.trim();
  const idempotencyTtlRaw = process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES?.trim();

  if (!hmacSecret || hmacSecret.length < 32) {
    return {
      valid: false,
      error:
        "CHECKOUT_HMAC_SECRET is missing or insufficiently long (minimum 32 characters required).",
    };
  }

  if (!primaryLocationCode || primaryLocationCode.length === 0) {
    return {
      valid: false,
      error: "CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is missing or empty.",
    };
  }

  const reservationTtlMinutes = Number(reservationTtlRaw);
  if (!Number.isInteger(reservationTtlMinutes) || reservationTtlMinutes <= 0) {
    return {
      valid: false,
      error: "CHECKOUT_RESERVATION_TTL_MINUTES must be a positive integer.",
    };
  }

  const idempotencyTtlMinutes = Number(idempotencyTtlRaw);
  if (!Number.isInteger(idempotencyTtlMinutes) || idempotencyTtlMinutes <= 0) {
    return {
      valid: false,
      error: "CHECKOUT_IDEMPOTENCY_TTL_MINUTES must be a positive integer.",
    };
  }

  return {
    valid: true,
    config: {
      hmacSecret,
      primaryLocationCode,
      reservationTtlMinutes,
      idempotencyTtlMinutes,
    },
  };
}
