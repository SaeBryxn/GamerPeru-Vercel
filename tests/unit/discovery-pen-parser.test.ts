import { describe, expect, it } from "vitest";
import { formatCentsToPenDecimal, parsePenStringToCents } from "@/lib/discovery-filters/pen-parser";

describe("PEN Parser and Serializer (GP-013 Safety & Precision)", () => {
  it("correctly parses standard decimal strings to authoritative integer cents", () => {
    expect(parsePenStringToCents("100")).toBe(10000);
    expect(parsePenStringToCents("100.0")).toBe(10000);
    expect(parsePenStringToCents("100.00")).toBe(10000);
    expect(parsePenStringToCents("100.9")).toBe(10090);
    expect(parsePenStringToCents("100.90")).toBe(10090);
    expect(parsePenStringToCents("100.99")).toBe(10099);
    expect(parsePenStringToCents("0.01")).toBe(1);
    expect(parsePenStringToCents("99999.99")).toBe(9999999);
  });

  it("handles Peruvian comma decimal separator as alias", () => {
    expect(parsePenStringToCents("100,50")).toBe(10050);
    expect(parsePenStringToCents("0,05")).toBe(5);
  });

  it("returns null for non-numeric, negative, or malformed strings", () => {
    expect(parsePenStringToCents("")).toBeNull();
    expect(parsePenStringToCents("   ")).toBeNull();
    expect(parsePenStringToCents("-50")).toBeNull();
    expect(parsePenStringToCents("abc")).toBeNull();
    expect(parsePenStringToCents("100.999")).toBeNull(); // More than 2 decimals
    expect(parsePenStringToCents("100.0.0")).toBeNull();
  });

  it("enforces safety bounds [1, 9999999] cents", () => {
    expect(parsePenStringToCents("0")).toBeNull(); // Below 1 cent
    expect(parsePenStringToCents("0.00")).toBeNull();
    expect(parsePenStringToCents("100000")).toBeNull(); // Above 99,999.99 PEN
    expect(parsePenStringToCents("99999999999999999")).toBeNull();
  });

  it("formats integer cents to minimal decimal PEN string without trailing zeros", () => {
    expect(formatCentsToPenDecimal(10000)).toBe("100");
    expect(formatCentsToPenDecimal(10090)).toBe("100.9");
    expect(formatCentsToPenDecimal(10099)).toBe("100.99");
    expect(formatCentsToPenDecimal(1)).toBe("0.01");
    expect(formatCentsToPenDecimal(9999999)).toBe("99999.99");
  });
});
