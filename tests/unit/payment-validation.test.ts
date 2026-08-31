import { describe, expect, it } from "vitest";
import {
  computePaymentAuthorityBindingDigest,
  computePaymentSessionTokenDigest,
  computePaymentSubmissionFingerprint,
  generateSecurePaymentSessionToken,
} from "@/lib/payments/crypto";
import { validateOperationCode } from "@/lib/payments/service";

describe("Payment Operation Code & Crypto Unit Tests", () => {
  describe("validateOperationCode", () => {
    it("preserves leading zeroes on numeric operation codes", () => {
      const res = validateOperationCode("00012345678");
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.normalized).toBe("00012345678");
      }
    });

    it("trims outer whitespace safely", () => {
      const res = validateOperationCode("  OP-987654  ");
      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.normalized).toBe("OP-987654");
      }
    });

    it("accepts provider-neutral alphanumeric and punctuation strings", () => {
      const codes = ["123456", "BCP-9876", "BBVA_OP_001", "INTERBANK:9988", "PLIN-001298#1"];
      for (const c of codes) {
        const res = validateOperationCode(c);
        expect(res.valid).toBe(true);
      }
    });

    it("rejects empty or whitespace-only strings", () => {
      expect(validateOperationCode("").valid).toBe(false);
      expect(validateOperationCode("   ").valid).toBe(false);
    });

    it("rejects strings exceeding 50 characters", () => {
      const longCode = "A".repeat(51);
      const res = validateOperationCode(longCode);
      expect(res.valid).toBe(false);
    });

    it("rejects dangerous control characters and invisible separators", () => {
      expect(validateOperationCode("OP\x00123").valid).toBe(false);
      expect(validateOperationCode("OP\x1B456").valid).toBe(false);
      expect(validateOperationCode("OP\x7F789").valid).toBe(false);
    });
  });

  describe("Payment Crypto & Digest Functions", () => {
    const testSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    it("generates 256-bit secure session tokens in base64url format", () => {
      const token1 = generateSecurePaymentSessionToken();
      const token2 = generateSecurePaymentSessionToken();
      expect(token1).toHaveLength(43);
      expect(token2).toHaveLength(43);
      expect(token1).not.toBe(token2);
    });

    it("computes domain-separated session token digest", () => {
      const rawToken = "my-secure-guest-token";
      const digest = computePaymentSessionTokenDigest(rawToken, testSecret);
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("computes domain-separated authority binding digest for authenticated vs guest", () => {
      const authDigest = computePaymentAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "prof-123" },
        testSecret
      );
      const guestDigest = computePaymentAuthorityBindingDigest(
        { type: "GUEST", sessionId: "sess-123" },
        testSecret
      );
      expect(authDigest).toHaveLength(64);
      expect(guestDigest).toHaveLength(64);
      expect(authDigest).not.toBe(guestDigest);
    });

    it("computes domain-separated request fingerprint for idempotency", () => {
      const fp1 = computePaymentSubmissionFingerprint(
        {
          paymentId: "pay-1",
          normalizedOpCode: "12345",
          uploadIntentId: null,
          authorityBindingDigest: "auth-1",
        },
        testSecret
      );
      const fp2 = computePaymentSubmissionFingerprint(
        {
          paymentId: "pay-1",
          normalizedOpCode: "12345",
          uploadIntentId: "intent-1",
          authorityBindingDigest: "auth-1",
        },
        testSecret
      );
      expect(fp1).toHaveLength(64);
      expect(fp2).toHaveLength(64);
      expect(fp1).not.toBe(fp2);
    });
  });
});
