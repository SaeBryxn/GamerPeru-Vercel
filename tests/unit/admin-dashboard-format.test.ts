import { describe, expect, it } from "vitest";
import {
  formatCentsToPen,
  formatCountTrend,
  formatInteger,
  formatMonetaryTrend,
} from "@/lib/admin/dashboard-format";
import type { CountTrend, MonetaryTrend } from "@/lib/admin/dashboard-types";

describe("GP-023 / CHK2 — Admin Dashboard Formatting Utilities", () => {
  describe("formatCentsToPen", () => {
    it("formats zero cents as S/ 0.00", () => {
      expect(formatCentsToPen(0n)).toBe("S/ 0.00");
    });

    it("formats single-digit cents correctly", () => {
      expect(formatCentsToPen(1n)).toBe("S/ 0.01");
      expect(formatCentsToPen(9n)).toBe("S/ 0.09");
    });

    it("formats sub-hundred cents correctly", () => {
      expect(formatCentsToPen(50n)).toBe("S/ 0.50");
      expect(formatCentsToPen(99n)).toBe("S/ 0.99");
    });

    it("formats 105 cents as S/ 1.05", () => {
      expect(formatCentsToPen(105n)).toBe("S/ 1.05");
    });

    it("formats multiple soles with thousand separators", () => {
      expect(formatCentsToPen(10000n)).toBe("S/ 100.00");
      expect(formatCentsToPen(1234567n)).toBe("S/ 12,345.67");
      expect(formatCentsToPen(100000000n)).toBe("S/ 1,000,000.00");
    });

    it("formats negative cents correctly", () => {
      expect(formatCentsToPen(-1n)).toBe("-S/ 0.01");
      expect(formatCentsToPen(-105n)).toBe("-S/ 1.05");
      expect(formatCentsToPen(-1234567n)).toBe("-S/ 12,345.67");
    });

    it("formats positive cents with showSign option", () => {
      expect(formatCentsToPen(5000n, { showSign: true })).toBe("+S/ 50.00");
      expect(formatCentsToPen(0n, { showSign: true })).toBe("S/ 0.00");
      expect(formatCentsToPen(-5000n, { showSign: true })).toBe("-S/ 50.00");
    });

    it("preserves exact precision for values above Number.MAX_SAFE_INTEGER", () => {
      // 9007199254740993n cents = S/ 90,071,992,547,409.93
      const largeValue = 9007199254740993n;
      expect(formatCentsToPen(largeValue)).toBe("S/ 90,071,992,547,409.93");

      const negativeLargeValue = -9007199254740993n;
      expect(formatCentsToPen(negativeLargeValue)).toBe("-S/ 90,071,992,547,409.93");
    });
  });

  describe("formatInteger", () => {
    it("formats positive and zero integers", () => {
      expect(formatInteger(0)).toBe("0");
      expect(formatInteger(42)).toBe("42");
      expect(formatInteger(1234)).toBe("1,234");
      expect(formatInteger(1000000)).toBe("1,000,000");
    });

    it("formats BigInt integers", () => {
      expect(formatInteger(0n)).toBe("0");
      expect(formatInteger(9007199254740993n)).toBe("9,007,199,254,740,993");
    });

    it("formats negative integers", () => {
      expect(formatInteger(-500)).toBe("-500");
      expect(formatInteger(-123456)).toBe("-123,456");
    });
  });

  describe("formatMonetaryTrend", () => {
    it("formats ZERO_BASELINE as 0.0%", () => {
      const trend: MonetaryTrend = {
        semanticState: "ZERO_BASELINE",
        currentValue: 0n,
        previousValue: 0n,
        absoluteDelta: 0n,
        percentageNumerator: null,
        percentageDenominator: null,
      };
      const result = formatMonetaryTrend(trend);
      expect(result.text).toBe("0.0%");
      expect(result.direction).toBe("neutral");
    });

    it("formats NEW as 'Nuevo'", () => {
      const trend: MonetaryTrend = {
        semanticState: "NEW",
        currentValue: 50000n,
        previousValue: 0n,
        absoluteDelta: 50000n,
        percentageNumerator: null,
        percentageDenominator: null,
      };
      const result = formatMonetaryTrend(trend);
      expect(result.text).toBe("Nuevo");
      expect(result.direction).toBe("neutral");
    });

    it("formats FLAT as 0.0%", () => {
      const trend: MonetaryTrend = {
        semanticState: "FLAT",
        currentValue: 10000n,
        previousValue: 10000n,
        absoluteDelta: 0n,
        percentageNumerator: 0n,
        percentageDenominator: 10000n,
      };
      const result = formatMonetaryTrend(trend);
      expect(result.text).toBe("0.0%");
      expect(result.direction).toBe("neutral");
    });

    it("formats POSITIVE trend with ROUND HALF UP to one decimal", () => {
      // 12.5% -> 12.5%
      const trendHalf: MonetaryTrend = {
        semanticState: "POSITIVE",
        currentValue: 900n,
        previousValue: 800n,
        absoluteDelta: 100n,
        percentageNumerator: 100n,
        percentageDenominator: 800n,
      };
      expect(formatMonetaryTrend(trendHalf).text).toBe("+12.5%");
      expect(formatMonetaryTrend(trendHalf).direction).toBe("positive");

      // 33.333% -> 33.3%
      const trendThird: MonetaryTrend = {
        semanticState: "POSITIVE",
        currentValue: 400n,
        previousValue: 300n,
        absoluteDelta: 100n,
        percentageNumerator: 100n,
        percentageDenominator: 300n,
      };
      expect(formatMonetaryTrend(trendThird).text).toBe("+33.3%");

      // 66.666% -> 66.7%
      const trendTwoThirds: MonetaryTrend = {
        semanticState: "POSITIVE",
        currentValue: 500n,
        previousValue: 300n,
        absoluteDelta: 200n,
        percentageNumerator: 200n,
        percentageDenominator: 300n,
      };
      expect(formatMonetaryTrend(trendTwoThirds).text).toBe("+66.7%");
    });

    it("formats NEGATIVE trend with directional minus", () => {
      // -50.0%
      const trendNeg: MonetaryTrend = {
        semanticState: "NEGATIVE",
        currentValue: 5000n,
        previousValue: 10000n,
        absoluteDelta: -5000n,
        percentageNumerator: -5000n,
        percentageDenominator: 10000n,
      };
      const result = formatMonetaryTrend(trendNeg);
      expect(result.text).toBe("-50.0%");
      expect(result.direction).toBe("negative");
    });

    it("formats large numbers > Number.MAX_SAFE_INTEGER correctly in trend calculations", () => {
      const largeBase = 9007199254740993n;
      const trendLarge: MonetaryTrend = {
        semanticState: "POSITIVE",
        currentValue: largeBase * 2n,
        previousValue: largeBase,
        absoluteDelta: largeBase,
        percentageNumerator: largeBase,
        percentageDenominator: largeBase,
      };
      expect(formatMonetaryTrend(trendLarge).text).toBe("+100.0%");
    });
  });

  describe("formatCountTrend", () => {
    it("formats ZERO_BASELINE and NEW states", () => {
      const zeroTrend: CountTrend = {
        semanticState: "ZERO_BASELINE",
        currentValue: 0,
        previousValue: 0,
        absoluteDelta: 0,
        percentageDelta: null,
      };
      expect(formatCountTrend(zeroTrend).text).toBe("0.0%");

      const newTrend: CountTrend = {
        semanticState: "NEW",
        currentValue: 5,
        previousValue: 0,
        absoluteDelta: 5,
        percentageDelta: null,
      };
      expect(formatCountTrend(newTrend).text).toBe("Nuevo");
    });

    it("formats POSITIVE and NEGATIVE count trends", () => {
      const posTrend: CountTrend = {
        semanticState: "POSITIVE",
        currentValue: 15,
        previousValue: 10,
        absoluteDelta: 5,
        percentageDelta: 50,
      };
      expect(formatCountTrend(posTrend).text).toBe("+50.0%");
      expect(formatCountTrend(posTrend).direction).toBe("positive");

      const negTrend: CountTrend = {
        semanticState: "NEGATIVE",
        currentValue: 8,
        previousValue: 10,
        absoluteDelta: -2,
        percentageDelta: -20,
      };
      expect(formatCountTrend(negTrend).text).toBe("-20.0%");
      expect(formatCountTrend(negTrend).direction).toBe("negative");
    });
  });
});
