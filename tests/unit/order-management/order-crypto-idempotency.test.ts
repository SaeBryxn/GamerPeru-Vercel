import { describe, expect, it } from "vitest";
import {
  computeOrderAuthorityBindingDigest,
  computeOrderCancellationFingerprint,
  computeRefundFingerprint,
  createOrderAdvisoryLockKey,
} from "@/lib/orders/crypto";

describe("GP-020 — Order Crypto & Idempotency", () => {
  const testSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("computes distinct authority binding digests for authenticated vs guest vs staff", () => {
    const authDigest = computeOrderAuthorityBindingDigest(
      { type: "AUTHENTICATED", customerProfileId: "prof-123" },
      testSecret
    );
    const guestDigest = computeOrderAuthorityBindingDigest(
      { type: "GUEST", sessionId: "sess-456" },
      testSecret
    );
    const staffDigest = computeOrderAuthorityBindingDigest(
      { type: "STAFF", authUserId: "user-789" },
      testSecret
    );
    const systemDigest = computeOrderAuthorityBindingDigest({ type: "SYSTEM" }, testSecret);

    expect(authDigest).toHaveLength(64);
    expect(guestDigest).toHaveLength(64);
    expect(staffDigest).toHaveLength(64);
    expect(systemDigest).toHaveLength(64);

    expect(authDigest).not.toEqual(guestDigest);
    expect(authDigest).not.toEqual(staffDigest);
    expect(staffDigest).not.toEqual(systemDigest);
  });

  it("computes deterministic cancellation fingerprint", () => {
    const fp1 = computeOrderCancellationFingerprint(
      {
        orderId: "ord-1",
        normalizedReason: "Cancelado",
        authorityBindingDigest: "auth-digest-1",
      },
      testSecret
    );

    const fp2 = computeOrderCancellationFingerprint(
      {
        orderId: "ord-1",
        normalizedReason: "Cancelado",
        authorityBindingDigest: "auth-digest-1",
      },
      testSecret
    );

    const fpChanged = computeOrderCancellationFingerprint(
      {
        orderId: "ord-1",
        normalizedReason: "Otro motivo",
        authorityBindingDigest: "auth-digest-1",
      },
      testSecret
    );

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpChanged);
  });

  it("computes deterministic refund fingerprint", () => {
    const fp1 = computeRefundFingerprint(
      {
        paymentId: "pay-1",
        amountCents: 5000,
        normalizedReason: "Defecto",
        externalReference: "00123",
        authorityBindingDigest: "auth-digest-staff",
      },
      testSecret
    );

    const fp2 = computeRefundFingerprint(
      {
        paymentId: "pay-1",
        amountCents: 5000,
        normalizedReason: "Defecto",
        externalReference: "00123",
        authorityBindingDigest: "auth-digest-staff",
      },
      testSecret
    );

    const fpDiffAmount = computeRefundFingerprint(
      {
        paymentId: "pay-1",
        amountCents: 6000,
        normalizedReason: "Defecto",
        externalReference: "00123",
        authorityBindingDigest: "auth-digest-staff",
      },
      testSecret
    );

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpDiffAmount);
  });

  it("derives deterministic 32-bit integer advisory lock key", () => {
    const key1 = createOrderAdvisoryLockKey("ORDER_CANCELLATION:attempt-1234567890");
    const key2 = createOrderAdvisoryLockKey("ORDER_CANCELLATION:attempt-1234567890");
    const key3 = createOrderAdvisoryLockKey("ORDER_CANCELLATION:attempt-9999999999");

    expect(Number.isInteger(key1)).toBe(true);
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
