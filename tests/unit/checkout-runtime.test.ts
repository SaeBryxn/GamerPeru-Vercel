import { describe, expect, it } from "vitest";
import { getCheckoutConfig } from "@/lib/checkout/config";
import {
  computeAuthorityBindingDigest,
  computeRequestFingerprint,
  generateOrderNumber,
} from "@/lib/checkout/crypto";
import { validateCheckoutSubmitInput } from "@/lib/checkout/validation";

describe("GP-018 / CHK5 — Checkout Runtime Unit Suite", () => {
  describe("1. Order Number Generation & Shape", () => {
    it("generates order numbers with the canonical GP-XXXXXXXX format", () => {
      const orderNumber = generateOrderNumber();
      expect(orderNumber).toMatch(/^GP-[0-9A-Z]{8}$/);
      expect(orderNumber.length).toBe(11);
    });

    it("generates distinct non-sequential order numbers across 100 iterations", () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const num = generateOrderNumber();
        expect(num).toMatch(/^GP-[0-9A-Z]{8}$/);
        set.add(num);
      }
      expect(set.size).toBe(100);
    });
  });

  describe("2. Cryptographic Authority Binding Digest", () => {
    const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    it("produces a 64-character hex SHA-256 HMAC digest", () => {
      const digest = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000001" },
        secret
      );
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for identical authority inputs", () => {
      const d1 = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000001" },
        secret
      );
      const d2 = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000001" },
        secret
      );
      expect(d1).toBe(d2);
    });

    it("produces distinct digests for authenticated vs guest authorities even if IDs match", () => {
      const sameStr = "018f0000-0000-7000-8000-000000000001";
      const authDigest = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: sameStr },
        secret
      );
      const guestDigest = computeAuthorityBindingDigest(
        { type: "GUEST", guestToken: sameStr },
        secret
      );
      expect(authDigest).not.toBe(guestDigest);
    });

    it("produces distinct digests for different customers", () => {
      const d1 = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000001" },
        secret
      );
      const d2 = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000002" },
        secret
      );
      expect(d1).not.toBe(d2);
    });
  });

  describe("3. Request Fingerprint Normalization & Salting", () => {
    const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const baseAddress = {
      recipientName: " Juan Perez ",
      phone: " 999888777 ",
      streetAddress: " Av. Larco 123 ",
      apartmentSuite: " Dpto 401 ",
      department: " Lima ",
      province: " Lima ",
      district: " Miraflores ",
      postalCode: " 15074 ",
      referenceNotes: " Frente al parque ",
    };

    it("produces a 64-character hex SHA-256 HMAC fingerprint", () => {
      const fp = computeRequestFingerprint(
        {
          sourceCartId: "018f0000-0000-7000-8000-00000000c001",
          shippingMethodCode: "LIMA_EXPRESS",
          paymentMethodCode: "YAPE_MANUAL",
          customerEmail: "JUAN.PEREZ@EXAMPLE.COM",
          deliveryAddress: { mode: "INLINE", address: baseAddress },
        },
        secret
      );
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it("normalizes email case and whitespace trimming identically", () => {
      const fp1 = computeRequestFingerprint(
        {
          sourceCartId: "018f0000-0000-7000-8000-00000000c001",
          shippingMethodCode: "LIMA_EXPRESS",
          paymentMethodCode: "YAPE_MANUAL",
          customerEmail: " Juan.Perez@Example.Com ",
          deliveryAddress: { mode: "INLINE", address: baseAddress },
        },
        secret
      );
      const fp2 = computeRequestFingerprint(
        {
          sourceCartId: "018f0000-0000-7000-8000-00000000c001",
          shippingMethodCode: "LIMA_EXPRESS",
          paymentMethodCode: "YAPE_MANUAL",
          customerEmail: "juan.perez@example.com",
          deliveryAddress: { mode: "INLINE", address: baseAddress },
        },
        secret
      );
      expect(fp1).toBe(fp2);
    });

    it("changes fingerprint when any material intent parameter changes", () => {
      const baseParams = {
        sourceCartId: "018f0000-0000-7000-8000-00000000c001",
        shippingMethodCode: "LIMA_EXPRESS",
        paymentMethodCode: "YAPE_MANUAL",
        customerEmail: "juan.perez@example.com",
        deliveryAddress: { mode: "INLINE" as const, address: baseAddress },
      };
      const fpOriginal = computeRequestFingerprint(baseParams, secret);

      const fpDiffShipping = computeRequestFingerprint(
        { ...baseParams, shippingMethodCode: "LIMA_REGULAR" },
        secret
      );
      expect(fpOriginal).not.toBe(fpDiffShipping);

      const fpDiffPayment = computeRequestFingerprint(
        { ...baseParams, paymentMethodCode: "PLIN_MANUAL" },
        secret
      );
      expect(fpOriginal).not.toBe(fpDiffPayment);

      const fpDiffCart = computeRequestFingerprint(
        { ...baseParams, sourceCartId: "018f0000-0000-7000-8000-00000000c002" },
        secret
      );
      expect(fpOriginal).not.toBe(fpDiffCart);

      const fpDiffAddressMode = computeRequestFingerprint(
        {
          ...baseParams,
          deliveryAddress: {
            mode: "SAVED_ADDRESS",
            addressId: "018f0000-0000-7000-8000-00000000a001",
          },
        },
        secret
      );
      expect(fpOriginal).not.toBe(fpDiffAddressMode);
    });

    it("is completely distinct from authority binding digest", () => {
      const authorityDigest = computeAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: "018f0000-0000-7000-8000-000000000001" },
        secret
      );
      const requestFp = computeRequestFingerprint(
        {
          sourceCartId: "018f0000-0000-7000-8000-00000000c001",
          shippingMethodCode: "LIMA_EXPRESS",
          paymentMethodCode: "YAPE_MANUAL",
          customerEmail: "juan.perez@example.com",
          deliveryAddress: { mode: "INLINE", address: baseAddress },
        },
        secret
      );
      expect(authorityDigest).not.toBe(requestFp);
    });
  });

  describe("4. Input Validation & Delivery Mode Discriminated Union", () => {
    const validBaseAddress = {
      recipientName: "Carlos Lopez",
      phone: "987654321",
      streetAddress: "Calle Los Cedros 456",
      apartmentSuite: "Piso 2",
      department: "Lima",
      province: "Lima",
      district: "San Isidro",
      postalCode: "15046",
      referenceNotes: "Puerta de rejas blancas",
    };

    const validInlineInput = {
      checkoutAttemptId: "018f0000-0000-7000-8000-000000000001",
      customerEmail: "carlos.lopez@example.com",
      deliveryAddress: {
        mode: "INLINE",
        address: validBaseAddress,
      },
      shippingMethodCode: "LIMA_EXPRESS",
      paymentMethodCode: "YAPE_MANUAL",
      reviewedSubtotalCents: 15000,
      reviewedShippingCents: 1500,
      reviewedTotalCents: 16500,
    };

    it("accepts valid INLINE address input", () => {
      const res = validateCheckoutSubmitInput(validInlineInput);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.customerEmail).toBe("carlos.lopez@example.com");
        expect(res.data.deliveryAddress.mode).toBe("INLINE");
      }
    });

    it("accepts valid SAVED_ADDRESS mode input", () => {
      const validSavedInput = {
        ...validInlineInput,
        deliveryAddress: {
          mode: "SAVED_ADDRESS",
          addressId: "018f0000-0000-7000-8000-00000000a001",
        },
      };
      const res = validateCheckoutSubmitInput(validSavedInput);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.deliveryAddress.mode).toBe("SAVED_ADDRESS");
      }
    });

    it("rejects non-UUID checkoutAttemptId", () => {
      const invalid = { ...validInlineInput, checkoutAttemptId: "not-a-uuid" };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });

    it("rejects invalid customer email format", () => {
      const invalid = { ...validInlineInput, customerEmail: "invalid-email" };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });

    it("rejects negative reviewed money values", () => {
      const invalid = { ...validInlineInput, reviewedSubtotalCents: -100 };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });

    it("rejects fractional/floating point reviewed money values", () => {
      const invalid = { ...validInlineInput, reviewedTotalCents: 165.5 };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });

    it("rejects malformed SAVED_ADDRESS missing or invalid UUID", () => {
      const invalid = {
        ...validInlineInput,
        deliveryAddress: { mode: "SAVED_ADDRESS", addressId: "invalid-id" },
      };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });

    it("rejects INLINE address with missing required fields", () => {
      const invalid = {
        ...validInlineInput,
        deliveryAddress: {
          mode: "INLINE",
          address: { ...validBaseAddress, streetAddress: "" },
        },
      };
      const res = validateCheckoutSubmitInput(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe("5. Configuration Fail-Closed Validation", () => {
    const originalEnv = { ...process.env };

    it("fails closed when CHECKOUT_HMAC_SECRET is missing", () => {
      delete process.env.CHECKOUT_HMAC_SECRET;
      process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "LOC-LIM-01";
      process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
      process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getCheckoutConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("CHECKOUT_HMAC_SECRET");
    });

    it("fails closed when CHECKOUT_HMAC_SECRET is shorter than 32 characters", () => {
      process.env.CHECKOUT_HMAC_SECRET = "short_secret_under_32_chars";
      process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "LOC-LIM-01";
      process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
      process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getCheckoutConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("minimum 32 characters required");
    });

    it("fails closed when CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE is missing", () => {
      process.env.CHECKOUT_HMAC_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
      delete process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE;
      process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
      process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getCheckoutConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE");
    });

    it("fails closed when TTL values are non-integers or non-positive", () => {
      process.env.CHECKOUT_HMAC_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "LOC-LIM-01";
      process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "-5";
      process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getCheckoutConfig();
      expect(res.valid).toBe(false);
      expect(res.error).toContain("CHECKOUT_RESERVATION_TTL_MINUTES");
    });

    it("succeeds when all configuration values are valid", () => {
      process.env.CHECKOUT_HMAC_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE = "LOC-LIM-01";
      process.env.CHECKOUT_RESERVATION_TTL_MINUTES = "30";
      process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES = "60";

      const res = getCheckoutConfig();
      expect(res.valid).toBe(true);
      expect(res.config?.primaryLocationCode).toBe("LOC-LIM-01");
      expect(res.config?.reservationTtlMinutes).toBe(30);
      expect(res.config?.idempotencyTtlMinutes).toBe(60);
    });

    // Restore original env
    process.env = originalEnv;
  });
});
