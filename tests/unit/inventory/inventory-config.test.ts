import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInventoryConfig } from "@/lib/inventory/config";

describe("GP-021 / CHK2-BR1 — Fail-Closed Inventory Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "LOC-LIM-01";
    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "1440";
    process.env.INVENTORY_HMAC_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.INVENTORY_QUARANTINE_LOCATION_CODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("succeeds with valid explicit configuration", () => {
    const res = getInventoryConfig();
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.config.primaryLocationCode).toBe("LOC-LIM-01");
      expect(res.config.idempotencyTtlMinutes).toBe(1440);
      expect(res.config.hmacSecret).toBe(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      );
      expect(res.config.quarantineLocationCode).toBeUndefined();
    }
  });

  it("fails closed when CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is missing", () => {
    delete process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE;
    const res = getInventoryConfig();
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain("CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is missing");
    }
  });

  it("fails closed when CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE contains invalid characters", () => {
    process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "INVALID LOCATION WITH SPACES!";
    const res = getInventoryConfig();
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain("CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is invalid");
    }
  });

  it("fails closed when INVENTORY_IDEMPOTENCY_TTL_MINUTES is missing", () => {
    delete process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES;
    const res = getInventoryConfig();
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain("INVENTORY_IDEMPOTENCY_TTL_MINUTES is missing");
    }
  });

  it("fails closed when INVENTORY_IDEMPOTENCY_TTL_MINUTES is non-integer or out of bounds", () => {
    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "0";
    const resZero = getInventoryConfig();
    expect(resZero.valid).toBe(false);

    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "20000";
    const resLarge = getInventoryConfig();
    expect(resLarge.valid).toBe(false);

    process.env.INVENTORY_IDEMPOTENCY_TTL_MINUTES = "invalid_number";
    const resNaN = getInventoryConfig();
    expect(resNaN.valid).toBe(false);
  });

  it("fails closed when INVENTORY_HMAC_SECRET is missing or shorter than 32 characters", () => {
    delete process.env.INVENTORY_HMAC_SECRET;
    const resMissing = getInventoryConfig();
    expect(resMissing.valid).toBe(false);
    if (!resMissing.valid) {
      expect(resMissing.error).toContain("INVENTORY_HMAC_SECRET must be explicitly configured");
    }

    process.env.INVENTORY_HMAC_SECRET = "too_short_secret";
    const resShort = getInventoryConfig();
    expect(resShort.valid).toBe(false);
    if (!resShort.valid) {
      expect(resShort.error).toContain("at least 32 characters long");
    }
  });

  it("validates optional INVENTORY_QUARANTINE_LOCATION_CODE when present", () => {
    process.env.INVENTORY_QUARANTINE_LOCATION_CODE = "LOC-LIM-QUARANTINE";
    const res = getInventoryConfig();
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.config.quarantineLocationCode).toBe("LOC-LIM-QUARANTINE");
    }

    process.env.INVENTORY_QUARANTINE_LOCATION_CODE = "INVALID CODE!";
    const resInvalid = getInventoryConfig();
    expect(resInvalid.valid).toBe(false);
    if (!resInvalid.valid) {
      expect(resInvalid.error).toContain("INVENTORY_QUARANTINE_LOCATION_CODE is invalid");
    }
  });
});
