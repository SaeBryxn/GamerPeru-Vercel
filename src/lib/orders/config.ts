import "server-only";

export type OrderManagementConfig = {
  idempotencyTtlMinutes: number;
  hmacSecret: string;
};

export type OrderManagementConfigResult =
  { valid: true; config: OrderManagementConfig } | { valid: false; error: string };

/**
 * Validates and retrieves server runtime configuration for order management.
 *
 * Invariants:
 * 1. ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES: Must be an integer between 1 and 10080 (7 days).
 * 2. CHECKOUT_HMAC_SECRET: Must be at least 32 characters for authority digests.
 * 3. Fail-Closed: Zero silent production fallbacks.
 */
export function getOrderManagementConfig(): OrderManagementConfigResult {
  const ttlRaw = process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES;
  if (!ttlRaw || ttlRaw.trim() === "") {
    return {
      valid: false,
      error: "ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES is missing or empty.",
    };
  }

  const ttl = Number(ttlRaw);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 10080) {
    return {
      valid: false,
      error: `ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES must be an integer between 1 and 10080. Received: "${ttlRaw}".`,
    };
  }

  const hmacSecret = process.env.CHECKOUT_HMAC_SECRET;
  if (!hmacSecret || hmacSecret.trim().length < 32) {
    return {
      valid: false,
      error: "CHECKOUT_HMAC_SECRET must be at least 32 characters long.",
    };
  }

  return {
    valid: true,
    config: {
      idempotencyTtlMinutes: ttl,
      hmacSecret: hmacSecret.trim(),
    },
  };
}
