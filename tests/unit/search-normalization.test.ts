import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  isSyntacticallyValidPage,
  normalizeSearchQuery,
  parsePageParam,
  parseSearchQueryParam,
} from "@/lib/search/normalization";

describe("GP-012 — Search Normalization & Escaping Utilities", () => {
  describe("normalizeSearchQuery", () => {
    it("handles empty and whitespace-only inputs", () => {
      expect(normalizeSearchQuery("")).toBe("");
      expect(normalizeSearchQuery("   ")).toBe("");
      expect(normalizeSearchQuery("\t\n  ")).toBe("");
    });

    it("collapses internal whitespace and trims outer whitespace", () => {
      expect(normalizeSearchQuery("  Beast   X  ")).toBe("Beast X");
      expect(normalizeSearchQuery("  MOUSE   PRO   MOD  01  ")).toBe("MOUSE PRO MOD 01");
    });

    it("preserves display casing without lowercase mutation", () => {
      expect(normalizeSearchQuery("MOUSE")).toBe("MOUSE");
      expect(normalizeSearchQuery("WLMOUSE Beast X")).toBe("WLMOUSE Beast X");
      expect(normalizeSearchQuery("teclado 8K")).toBe("teclado 8K");
    });

    it("normalizes Unicode into canonical NFC representation", () => {
      // Decomposed "a\u0301" vs composed "á"
      const decomposed = "meca\u0301nico";
      const composed = "mecánico";
      expect(normalizeSearchQuery(decomposed)).toBe(composed);
    });

    it("handles single-character and two-character queries", () => {
      expect(normalizeSearchQuery("x")).toBe("x");
      expect(normalizeSearchQuery("  x  ")).toBe("x");
      expect(normalizeSearchQuery("he")).toBe("he");
      expect(normalizeSearchQuery("8k")).toBe("8k");
    });

    it("bounds length to maximum 100 Unicode characters", () => {
      const exact100 = "a".repeat(100);
      expect(normalizeSearchQuery(exact100)).toBe(exact100);

      const over100 = "a".repeat(150);
      const normalized = normalizeSearchQuery(over100);
      expect(Array.from(normalized)).toHaveLength(100);
      expect(normalized).toBe("a".repeat(100));
    });

    it("handles special characters, punctuation, and SQL-like strings safely", () => {
      expect(normalizeSearchQuery("100%")).toBe("100%");
      expect(normalizeSearchQuery("mouse_model")).toBe("mouse_model");
      expect(normalizeSearchQuery("C:\\test\\path")).toBe("C:\\test\\path");
      expect(normalizeSearchQuery("' OR 1=1 --")).toBe("' OR 1=1 --");
      expect(normalizeSearchQuery('keyboard "gaming"')).toBe('keyboard "gaming"');
    });

    it("preserves emoji characters correctly up to limit", () => {
      const emojiStr = "🎮 mouse 🖱️";
      expect(normalizeSearchQuery(emojiStr)).toBe("🎮 mouse 🖱️");
    });
  });

  describe("escapeLikePattern", () => {
    it("escapes backslashes, percent signs, and underscores", () => {
      expect(escapeLikePattern("100%")).toBe("100\\%");
      expect(escapeLikePattern("mouse_pro")).toBe("mouse\\_pro");
      expect(escapeLikePattern("path\\to")).toBe("path\\\\to");
      expect(escapeLikePattern("100%_mouse\\test")).toBe("100\\%\\_mouse\\\\test");
    });

    it("leaves standard characters untouched", () => {
      expect(escapeLikePattern("Beast X 8K")).toBe("Beast X 8K");
      expect(escapeLikePattern("teclado")).toBe("teclado");
    });

    it("handles empty string", () => {
      expect(escapeLikePattern("")).toBe("");
    });
  });

  describe("parseSearchQueryParam", () => {
    it("parses single string query parameter", () => {
      expect(parseSearchQueryParam("  mouse  ")).toBe("mouse");
      expect(parseSearchQueryParam(undefined)).toBe("");
    });

    it("extracts the first non-empty query from duplicate array parameters", () => {
      expect(parseSearchQueryParam(["", "  teclado  ", "mouse"])).toBe("teclado");
      expect(parseSearchQueryParam(["   ", ""])).toBe("");
    });
  });

  describe("isSyntacticallyValidPage & parsePageParam", () => {
    it("validates positive integer strings", () => {
      expect(isSyntacticallyValidPage("1")).toBe(true);
      expect(isSyntacticallyValidPage("2")).toBe(true);
      expect(isSyntacticallyValidPage("100")).toBe(true);

      expect(isSyntacticallyValidPage("0")).toBe(false);
      expect(isSyntacticallyValidPage("-1")).toBe(false);
      expect(isSyntacticallyValidPage("abc")).toBe(false);
      expect(isSyntacticallyValidPage("1.5")).toBe(false);
      expect(isSyntacticallyValidPage("")).toBe(false);
      expect(isSyntacticallyValidPage(undefined)).toBe(false);
    });

    it("parses valid pages and falls back to 1 for invalid values", () => {
      expect(parsePageParam("2")).toBe(2);
      expect(parsePageParam("10")).toBe(10);
      expect(parsePageParam(["3", "5"])).toBe(3);

      expect(parsePageParam("0")).toBe(1);
      expect(parsePageParam("-5")).toBe(1);
      expect(parsePageParam("invalid")).toBe(1);
      expect(parsePageParam(undefined)).toBe(1);
    });
  });
});
