import { describe, expect, it } from "vitest";
import {
  validateCancelReason,
  validateRefundAmountCents,
  validateRefundExternalReference,
} from "@/lib/orders/validation";

describe("GP-020 — Order & Refund Validation", () => {
  describe("validateCancelReason", () => {
    it("accepts valid cancellation reason string", () => {
      const res = validateCancelReason("Cliente solicitó cambiar de color");
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.normalized).toBe("Cliente solicitó cambiar de color");
      }
    });

    it("falls back to default reason on undefined or empty", () => {
      const res1 = validateCancelReason(undefined, "Default reason");
      expect(res1).toEqual({ valid: true, normalized: "Default reason" });

      const res2 = validateCancelReason("   ", "Default reason");
      expect(res2).toEqual({ valid: true, normalized: "Default reason" });
    });

    it("rejects non-string input", () => {
      // @ts-expect-error test non-string
      const res = validateCancelReason(12345);
      expect(res.valid).toBe(false);
    });

    it("rejects reasons longer than 255 chars", () => {
      const longReason = "a".repeat(256);
      const res = validateCancelReason(longReason);
      expect(res.valid).toBe(false);
    });

    it("rejects control / invisible characters", () => {
      const invisible = "Cancelado \u200B con zero width space";
      const res = validateCancelReason(invisible);
      expect(res.valid).toBe(false);
    });
  });

  describe("validateRefundAmountCents", () => {
    it("accepts positive integer cents", () => {
      expect(validateRefundAmountCents(100)).toEqual({ valid: true, amountCents: 100 });
      expect(validateRefundAmountCents(5000)).toEqual({ valid: true, amountCents: 5000 });
    });

    it("rejects zero or negative cents", () => {
      expect(validateRefundAmountCents(0).valid).toBe(false);
      expect(validateRefundAmountCents(-50).valid).toBe(false);
    });

    it("rejects non-integer / floating-point amounts", () => {
      expect(validateRefundAmountCents(10.5).valid).toBe(false);
      expect(validateRefundAmountCents("100").valid).toBe(false);
      expect(validateRefundAmountCents(null).valid).toBe(false);
    });
  });

  describe("validateRefundExternalReference", () => {
    it("accepts valid alphanumeric bank reference preserving leading zeros", () => {
      const res = validateRefundExternalReference("00049281");
      expect(res).toEqual({ valid: true, normalized: "00049281" });
    });

    it("accepts null/undefined as valid null reference", () => {
      expect(validateRefundExternalReference(undefined)).toEqual({
        valid: true,
        normalized: null,
      });
      expect(validateRefundExternalReference(null)).toEqual({
        valid: true,
        normalized: null,
      });
      expect(validateRefundExternalReference("")).toEqual({
        valid: true,
        normalized: null,
      });
    });

    it("rejects reference exceeding 100 chars", () => {
      const longRef = "0".repeat(101);
      expect(validateRefundExternalReference(longRef).valid).toBe(false);
    });
  });
});
