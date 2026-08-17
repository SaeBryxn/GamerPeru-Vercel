import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/utils/currency";

describe("Currency Formatter (formatCurrency)", () => {
  it("formats standard product price in Peruvian Soles", () => {
    expect(formatCurrency(12990)).toBe("S/ 129.90");
    expect(formatCurrency(58900)).toBe("S/ 589.00");
  });

  it("formats zero cents", () => {
    expect(formatCurrency(0)).toBe("S/ 0.00");
  });

  it("formats single digit cents (1 to 9)", () => {
    expect(formatCurrency(1)).toBe("S/ 0.01");
    expect(formatCurrency(9)).toBe("S/ 0.09");
  });

  it("formats double digit cents (10 to 99)", () => {
    expect(formatCurrency(10)).toBe("S/ 0.10");
    expect(formatCurrency(99)).toBe("S/ 0.99");
  });

  it("formats exact integer Soles (multiples of 100)", () => {
    expect(formatCurrency(100)).toBe("S/ 1.00");
    expect(formatCurrency(50000)).toBe("S/ 500.00");
  });

  it("formats large amounts with thousands separators", () => {
    const formatted = formatCurrency(1250000);
    // Should be S/ 12 500.00, S/ 12,500.00 or S/ 12.500.00 depending on locale
    expect(formatted).toMatch(/^S\/ 12[.,\s]?500\.00$/);
  });

  it("handles negative amounts gracefully", () => {
    expect(formatCurrency(-5000)).toBe("-S/ 50.00");
  });

  it("handles NaN and Infinity safely without throwing", () => {
    expect(formatCurrency(Number.NaN)).toBe("S/ 0.00");
    expect(formatCurrency(Infinity)).toBe("S/ 0.00");
    expect(formatCurrency(-Infinity)).toBe("S/ 0.00");
  });
});
