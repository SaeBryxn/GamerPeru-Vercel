import "server-only";
import { validateLocationCode } from "./validation";

/**
 * Gamer Perú — Inventory Engine Configuration (GP-021)
 */

export interface InventoryConfig {
  primaryLocationCode: string;
  quarantineLocationCode?: string;
  idempotencyTtlMinutes: number;
  hmacSecret: string;
}

export type InventoryConfigResult =
  { valid: true; config: InventoryConfig } | { valid: false; error: string; config?: undefined };

/**
 * Validates and retrieves server runtime configuration for the inventory engine.
 *
 * Invariants:
 * 1. CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE: Must be an explicit valid location code (no invented fallbacks).
 * 2. INVENTORY_IDEMPOTENCY_TTL_MINUTES: Must be an integer between 1 and 10080 (7 days).
 * 3. INVENTORY_HMAC_SECRET: Must be explicitly configured with at least 32 characters (256-bit safe).
 * 4. INVENTORY_QUARANTINE_LOCATION_CODE: If present, must be a valid location code.
 * 5. Fail-Closed: Zero silent production fallbacks.
 */
export function getInventoryConfig(): InventoryConfigResult {
  const primaryLocRaw = process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE;
  if (!primaryLocRaw || primaryLocRaw.trim() === "") {
    return {
      valid: false,
      error: "CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is missing or empty.",
    };
  }

  const primaryLocVal = validateLocationCode(primaryLocRaw.trim());
  if (!primaryLocVal.valid || !primaryLocVal.normalized) {
    return {
      valid: false,
      error: `CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is invalid: ${primaryLocVal.error}`,
    };
  }

  const ttlRaw = process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES;
  if (!ttlRaw || ttlRaw.trim() === "") {
    return {
      valid: false,
      error: "INVENTORY_IDEMPOTENCY_TTL_MINUTES is missing or empty.",
    };
  }

  const ttl = Number(ttlRaw);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 10080) {
    return {
      valid: false,
      error: `INVENTORY_IDEMPOTENCY_TTL_MINUTES must be an integer between 1 and 10080. Received: "${ttlRaw}".`,
    };
  }

  const hmacSecret = process.env.INVENTORY_HMAC_SECRET;
  if (!hmacSecret || hmacSecret.trim().length < 32) {
    return {
      valid: false,
      error: "INVENTORY_HMAC_SECRET must be explicitly configured and at least 32 characters long.",
    };
  }

  let quarantineLocationCode: string | undefined;
  const quarantineLocRaw = process.env.INVENTORY_QUARANTINE_LOCATION_CODE;
  if (quarantineLocRaw && quarantineLocRaw.trim() !== "") {
    const qVal = validateLocationCode(quarantineLocRaw.trim());
    if (!qVal.valid || !qVal.normalized) {
      return {
        valid: false,
        error: `INVENTORY_QUARANTINE_LOCATION_CODE is invalid: ${qVal.error}`,
      };
    }
    quarantineLocationCode = qVal.normalized;
  }

  return {
    valid: true,
    config: {
      primaryLocationCode: primaryLocVal.normalized,
      quarantineLocationCode,
      idempotencyTtlMinutes: ttl,
      hmacSecret: hmacSecret.trim(),
    },
  };
}
