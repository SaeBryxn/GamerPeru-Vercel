/**
 * Gamer Perú — Inventory Engine Configuration (GP-021)
 */

export interface InventoryConfig {
  primaryLocationCode: string;
  quarantineLocationCode: string;
  idempotencyTtlMinutes: number;
  hmacSecret: string;
}

export interface InventoryConfigResult {
  valid: boolean;
  config?: InventoryConfig;
  error?: string;
}

export function getInventoryConfig(): InventoryConfigResult {
  const primaryLocationCode = process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE ?? "LOC-LIM-01";
  const quarantineLocationCode =
    process.env.INVENTORY_QUARANTINE_LOCATION_CODE ?? "LOC-LIM-QUARANTINE";

  const rawTtl = process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES;
  let idempotencyTtlMinutes = 1440; // 24 hours default
  if (rawTtl) {
    const parsed = parseInt(rawTtl, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      idempotencyTtlMinutes = parsed;
    }
  }

  // Derive HMAC secret for request fingerprinting
  const hmacSecret =
    process.env.INVENTORY_HMAC_SECRET ??
    process.env.ORDERS_HMAC_SECRET ??
    process.env.CHECKOUT_HMAC_SECRET ??
    process.env.SUPABASE_JWT_SECRET ??
    "gp_inventory_default_hmac_secret_2026_fallback";

  return {
    valid: true,
    config: {
      primaryLocationCode,
      quarantineLocationCode,
      idempotencyTtlMinutes,
      hmacSecret,
    },
  };
}
