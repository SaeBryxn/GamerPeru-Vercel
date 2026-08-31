import { describe, expect, it } from "vitest";
import {
  computePaymentAuthorityBindingDigest,
  computePaymentSessionTokenDigest,
  computePaymentSubmissionFingerprint,
  generateSecurePaymentSessionToken,
} from "@/lib/payments/crypto";
import { validateOperationCode } from "@/lib/payments/service";
import { getPaymentSubmissionConfig } from "@/lib/payments/config";

describe("Payment Operation Code & Validation Unit Tests", () => {
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

    it("accepts provider-neutral alphanumeric and visible punctuation strings", () => {
      const codes = [
        "123456",
        "BCP-9876",
        "BBVA_OP_001",
        "INTERBANK:9988",
        "PLIN-001298#1",
        "YAPE/2026/08/999",
        "OP.7788.99",
      ];
      for (const c of codes) {
        const res = validateOperationCode(c);
        expect(res.valid).toBe(true);
        if (res.valid) {
          expect(res.normalized).toBe(c);
        }
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

    it("rejects ASCII control characters (\\x00..\\x1F, \\x7F)", () => {
      expect(validateOperationCode("OP\x00123").valid).toBe(false);
      expect(validateOperationCode("OP\x1B456").valid).toBe(false);
      expect(validateOperationCode("OP\x7F789").valid).toBe(false);
    });

    it("rejects Unicode invisible characters (ZWS, ZWJ, ZWNJ, BOM)", () => {
      // Zero-width space (\u200B)
      expect(validateOperationCode("OP\u200B12345").valid).toBe(false);
      // Zero-width joiner (\u200D)
      expect(validateOperationCode("OP\u200D12345").valid).toBe(false);
      // Zero-width non-joiner (\u200C)
      expect(validateOperationCode("OP\u200C12345").valid).toBe(false);
      // Byte order mark / ZWNBSP (\uFEFF)
      expect(validateOperationCode("\uFEFF12345").valid).toBe(false);
    });

    it("rejects Unicode bidi override and isolate controls", () => {
      // Right-to-left override (\u202E)
      expect(validateOperationCode("OP\u202E12345").valid).toBe(false);
      // Left-to-right embedding (\u202A)
      expect(validateOperationCode("OP\u202A12345").valid).toBe(false);
      // First strong isolate (\u2066)
      expect(validateOperationCode("OP\u206612345").valid).toBe(false);
    });

    it("rejects Unicode line separator (\\u2028) and paragraph separator (\\u2029)", () => {
      expect(validateOperationCode("OP\u2028123").valid).toBe(false);
      expect(validateOperationCode("OP\u2029456").valid).toBe(false);
    });
  });

  describe("getPaymentSubmissionConfig (Fail-Closed)", () => {
    const originalHmac = process.env.CHECKOUT_HMAC_SECRET;
    const originalTtl = process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES;

    it("fails closed when CHECKOUT_HMAC_SECRET is missing or < 32 characters", () => {
      process.env.CHECKOUT_HMAC_SECRET = "short_secret";
      process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getPaymentSubmissionConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("CHECKOUT_HMAC_SECRET");
    });

    it("fails closed when PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES is missing", () => {
      process.env.CHECKOUT_HMAC_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      delete process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES;

      const res = getPaymentSubmissionConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES is missing");
    });

    it("fails closed when PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES is non-integer, negative, zero, or > 10080", () => {
      process.env.CHECKOUT_HMAC_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      for (const badVal of ["abc", "-5", "0", "1.5", "10081"]) {
        process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = badVal;
        const res = getPaymentSubmissionConfig();
        expect(res.valid).toBe(false);
      }
    });

    it("succeeds with valid bounded positive integer", () => {
      process.env.CHECKOUT_HMAC_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getPaymentSubmissionConfig();
      expect(res.valid).toBe(true);
      if (res.valid && res.config) {
        expect(res.config.idempotencyTtlMinutes).toBe(60);
      }

      // Restore
      if (originalHmac) process.env.CHECKOUT_HMAC_SECRET = originalHmac;
      if (originalTtl) process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES = originalTtl;
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
