import { describe, expect, it } from "vitest";

describe("GP-021 — Inventory Calculations & Balance Invariants", () => {
  const calculateATS = (onHand: number, reserved: number, allocated: number) => {
    if (onHand < 0 || reserved < 0 || allocated < 0) {
      throw new Error("NEGATIVE_BALANCE_VIOLATION");
    }
    return onHand - reserved - allocated;
  };

  const evaluateLowStock = (ats: number, reorderPoint: number) => {
    return reorderPoint > 0 && ats <= reorderPoint;
  };

  it("calculates available_to_sell exactly under standard conditions", () => {
    expect(calculateATS(100, 20, 30)).toBe(50);
    expect(calculateATS(50, 0, 0)).toBe(50);
    expect(calculateATS(50, 50, 0)).toBe(0);
    expect(calculateATS(50, 0, 50)).toBe(0);
    expect(calculateATS(50, 25, 25)).toBe(0);
  });

  it("evaluates low_stock threshold correctly", () => {
    expect(evaluateLowStock(10, 5)).toBe(false);
    expect(evaluateLowStock(5, 5)).toBe(true);
    expect(evaluateLowStock(3, 5)).toBe(true);
    expect(evaluateLowStock(0, 5)).toBe(true);
    expect(evaluateLowStock(0, 0)).toBe(false); // reorderPoint 0 means unconfigured
  });

  it("rejects negative raw balance values", () => {
    expect(() => calculateATS(-10, 0, 0)).toThrow("NEGATIVE_BALANCE_VIOLATION");
    expect(() => calculateATS(10, -1, 0)).toThrow("NEGATIVE_BALANCE_VIOLATION");
    expect(() => calculateATS(10, 0, -5)).toThrow("NEGATIVE_BALANCE_VIOLATION");
  });

  it("evaluates DELTA adjustment resulting balance", () => {
    const applyDelta = (currentOnHand: number, delta: number) => {
      const resulting = currentOnHand + delta;
      if (resulting < 0) throw new Error("NEGATIVE_ON_HAND");
      return resulting;
    };

    expect(applyDelta(10, 5)).toBe(15);
    expect(applyDelta(10, -5)).toBe(5);
    expect(applyDelta(10, -10)).toBe(0);
    expect(() => applyDelta(10, -15)).toThrow("NEGATIVE_ON_HAND");
  });

  it("evaluates PHYSICAL_COUNT adjustment resulting delta", () => {
    const calculateCountDelta = (currentOnHand: number, counted: number) => {
      if (counted < 0) throw new Error("INVALID_COUNT");
      return counted - currentOnHand;
    };

    expect(calculateCountDelta(10, 15)).toBe(5);
    expect(calculateCountDelta(10, 8)).toBe(-2);
    expect(calculateCountDelta(10, 10)).toBe(0);
    expect(() => calculateCountDelta(10, -1)).toThrow("INVALID_COUNT");
  });
});
