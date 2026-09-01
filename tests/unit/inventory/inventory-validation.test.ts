import { describe, expect, it } from "vitest";
import {
  validateLocationCode,
  validateNonNegativeIntegerQuantity,
  validateNonZeroIntegerDelta,
  validatePositiveIntegerQuantity,
  validateReason,
  validateReferenceId,
  validateUuid,
} from "@/lib/inventory/validation";

describe("GP-021 — Inventory Input Validation", () => {
  describe("validatePositiveIntegerQuantity", () => {
    it("accepts positive integers", () => {
      expect(validatePositiveIntegerQuantity(1).valid).toBe(true);
      expect(validatePositiveIntegerQuantity(100).valid).toBe(true);
    });

    it("rejects zero, negative numbers, and non-integers", () => {
      expect(validatePositiveIntegerQuantity(0).valid).toBe(false);
      expect(validatePositiveIntegerQuantity(-5).valid).toBe(false);
      expect(validatePositiveIntegerQuantity(2.5).valid).toBe(false);
      expect(validatePositiveIntegerQuantity("10").valid).toBe(false);
    });
  });

  describe("validateNonNegativeIntegerQuantity", () => {
    it("accepts zero and positive integers", () => {
      expect(validateNonNegativeIntegerQuantity(0).valid).toBe(true);
      expect(validateNonNegativeIntegerQuantity(50).valid).toBe(true);
    });

    it("rejects negative numbers and non-integers", () => {
      expect(validateNonNegativeIntegerQuantity(-1).valid).toBe(false);
      expect(validateNonNegativeIntegerQuantity(1.1).valid).toBe(false);
    });
  });

  describe("validateNonZeroIntegerDelta", () => {
    it("accepts non-zero positive and negative integers", () => {
      expect(validateNonZeroIntegerDelta(5).valid).toBe(true);
      expect(validateNonZeroIntegerDelta(-5).valid).toBe(true);
    });

    it("rejects zero and non-integers", () => {
      expect(validateNonZeroIntegerDelta(0).valid).toBe(false);
      expect(validateNonZeroIntegerDelta(1.5).valid).toBe(false);
    });
  });

  describe("validateReason", () => {
    it("accepts clean non-empty string", () => {
      const res = validateReason("Caja dañada durante descarga");
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe("Caja dañada durante descarga");
    });

    it("rejects empty, whitespace-only, or too long string", () => {
      expect(validateReason("").valid).toBe(false);
      expect(validateReason("   ").valid).toBe(false);
      expect(validateReason("a".repeat(256)).valid).toBe(false);
    });

    it("rejects control and invisible characters", () => {
      expect(validateReason("Motivo \u200B con zero width").valid).toBe(false);
    });
  });

  describe("validateLocationCode", () => {
    it("accepts valid alphanumeric location code", () => {
      expect(validateLocationCode("LOC-LIM-01").valid).toBe(true);
      expect(validateLocationCode("LOC-LIM-QUARANTINE").valid).toBe(true);
    });

    it("rejects invalid characters in location code", () => {
      expect(validateLocationCode("LOC LIM 01").valid).toBe(false);
      expect(validateLocationCode("LOC/LIM/01").valid).toBe(false);
      expect(validateLocationCode("").valid).toBe(false);
    });
  });

  describe("validateReferenceId", () => {
    it("accepts non-empty reference string", () => {
      expect(validateReferenceId("PO-2026-009").valid).toBe(true);
    });

    it("rejects empty reference", () => {
      expect(validateReferenceId("   ").valid).toBe(false);
    });
  });

  describe("validateUuid", () => {
    it("accepts valid UUID string", () => {
      expect(validateUuid("018f0000-0000-7000-8000-000000000011").valid).toBe(true);
    });

    it("rejects invalid UUID string", () => {
      expect(validateUuid("invalid-uuid").valid).toBe(false);
      expect(validateUuid(123).valid).toBe(false);
    });
  });
});
