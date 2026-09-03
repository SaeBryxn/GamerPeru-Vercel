import { describe, expect, it } from "vitest";
import {
  formatCentsToPenDisplay,
  parsePenInputToCents,
  parsePenInputToCentsOrThrow,
} from "@/lib/admin/catalog/money";

describe("Admin Catalog Money Contract (parsePenInputToCents)", () => {
  it("parses valid integer and decimal PEN inputs deterministically without floating-point errors", () => {
    expect(parsePenInputToCents("129", "price_cents")).toEqual({ success: true, cents: 12900 });
    expect(parsePenInputToCents("129.9", "price_cents")).toEqual({ success: true, cents: 12990 });
    expect(parsePenInputToCents("129.90", "price_cents")).toEqual({ success: true, cents: 12990 });
    expect(parsePenInputToCents("0.50", "price_cents")).toEqual({ success: true, cents: 50 });
    expect(parsePenInputToCents("0.01", "price_cents")).toEqual({ success: true, cents: 1 });
  });

  it("normalizes optional leading S/ or s/ with whitespace", () => {
    expect(parsePenInputToCents("S/ 129.90", "price_cents")).toEqual({
      success: true,
      cents: 12990,
    });
    expect(parsePenInputToCents("s/129.90", "price_cents")).toEqual({
      success: true,
      cents: 12990,
    });
    expect(parsePenInputToCents("  S/  49.00  ", "price_cents")).toEqual({
      success: true,
      cents: 4900,
    });
  });

  it("strictly rejects commas to prevent decimal ambiguity", () => {
    const res1 = parsePenInputToCents("129,90", "price_cents");
    expect(res1.success).toBe(false);
    if (!res1.success) {
      expect(res1.code).toBe("COMMA_NOT_ACCEPTED");
    }

    const res2 = parsePenInputToCents("1,000.00", "price_cents");
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.code).toBe("COMMA_NOT_ACCEPTED");
    }

    const res3 = parsePenInputToCents("S/ 50,00", "price_cents");
    expect(res3.success).toBe(false);
    if (!res3.success) {
      expect(res3.code).toBe("COMMA_NOT_ACCEPTED");
    }
  });

  it("handles blank / empty values appropriately per field", () => {
    // price_cents is required
    const priceRes = parsePenInputToCents("", "price_cents");
    expect(priceRes.success).toBe(false);
    if (!priceRes.success) {
      expect(priceRes.code).toBe("PRICE_REQUIRED");
    }

    // compare_at_price_cents is optional (blank -> null)
    expect(parsePenInputToCents("", "compare_at_price_cents")).toEqual({
      success: true,
      cents: null,
    });
    expect(parsePenInputToCents("   ", "compare_at_price_cents")).toEqual({
      success: true,
      cents: null,
    });

    // cost_cents is optional (blank -> null)
    expect(parsePenInputToCents("", "cost_cents")).toEqual({ success: true, cents: null });
  });

  it("enforces price_cents >= 1n and permits 0 for compareAt and cost", () => {
    // 0 is rejected for price_cents
    const zeroPrice = parsePenInputToCents("0", "price_cents");
    expect(zeroPrice.success).toBe(false);
    if (!zeroPrice.success) {
      expect(zeroPrice.code).toBe("PRICE_NOT_POSITIVE");
    }

    // 0 is permitted for compare_at_price_cents and cost_cents
    expect(parsePenInputToCents("0", "compare_at_price_cents")).toEqual({
      success: true,
      cents: 0,
    });
    expect(parsePenInputToCents("0.00", "cost_cents")).toEqual({ success: true, cents: 0 });
  });

  it("enforces signed int32 maximum boundary (2147483647 cents)", () => {
    // 21,474,836.47 -> 2147483647 cents (exact int32 max)
    const maxInt32Res = parsePenInputToCents("21474836.47", "price_cents");
    expect(maxInt32Res).toEqual({ success: true, cents: 2147483647 });

    // 21,474,836.48 -> 2147483648 cents (overflows int32)
    const overflowRes = parsePenInputToCents("21474836.48", "price_cents");
    expect(overflowRes.success).toBe(false);
    if (!overflowRes.success) {
      expect(overflowRes.code).toBe("MONEY_VALUE_EXCEEDS_MAX_INT32");
    }
  });

  it("rejects invalid syntax (> 2 decimal places, letters, negatives)", () => {
    expect(parsePenInputToCents("12.345", "price_cents").success).toBe(false);
    expect(parsePenInputToCents("-10", "price_cents").success).toBe(false);
    expect(parsePenInputToCents("abc", "price_cents").success).toBe(false);
    expect(parsePenInputToCents("12..34", "price_cents").success).toBe(false);
    expect(parsePenInputToCents(null as unknown as string, "price_cents").success).toBe(false);
  });

  it("parsePenInputToCentsOrThrow throws on error and returns value on success", () => {
    expect(parsePenInputToCentsOrThrow("250.50", "price_cents")).toBe(25050);
    expect(() => parsePenInputToCentsOrThrow("invalid", "price_cents")).toThrow();
  });

  it("formats cents back to PEN display strings safely", () => {
    expect(formatCentsToPenDisplay(12900)).toBe("S/ 129.00");
    expect(formatCentsToPenDisplay(2147483647)).toBe("S/ 21,474,836.47");
    expect(formatCentsToPenDisplay(null)).toBeNull();
  });
});
