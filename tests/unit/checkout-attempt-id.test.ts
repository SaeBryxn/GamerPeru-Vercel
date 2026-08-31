import { describe, it, expect, vi, afterEach } from "vitest";
import { generateSecureCheckoutAttemptId } from "@/lib/checkout/attempt-id";

describe("GP-018 / CHK6-BR1 — Secure Checkout Attempt ID Generator", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  it("A. generates valid RFC4122 v4 UUID with crypto.randomUUID", () => {
    const mathRandomSpy = vi.spyOn(Math, "random");
    const id = generateSecureCheckoutAttemptId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it("B. generates unique non-repeating attempt IDs across multiple calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = generateSecureCheckoutAttemptId();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(50);
  });

  it("C. falls back cleanly to crypto.getRandomValues when crypto.randomUUID is absent", () => {
    const mathRandomSpy = vi.spyOn(Math, "random");

    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues: (array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = (i * 17 + 42) & 0xff;
          }
          return array;
        },
      },
      writable: true,
      configurable: true,
    });

    const id = generateSecureCheckoutAttemptId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it("D. fails closed when no secure crypto source is available (never falls back to Math.random)", () => {
    const mathRandomSpy = vi.spyOn(Math, "random");

    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    expect(() => generateSecureCheckoutAttemptId()).toThrow(/SECURE_CRYPTO_UNAVAILABLE/);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });
});
