import { describe, expect, it } from "vitest";
import {
  canonicalSerialize,
  computeMutationRequestDigest,
  computeRequestFingerprint,
  createCatalogAdvisoryLockKey,
  createCatalogAdvisoryLockKey32,
} from "@/lib/admin/catalog/crypto";

describe("Admin Catalog Crypto & Replay Serialization", () => {
  it("sorts object keys lexicographically and preserves array ordering", () => {
    const inputA = {
      z: "last",
      a: 1,
      nested: {
        b: [3, 2, 1],
        a: "first",
      },
    };

    const inputB = {
      nested: {
        a: "first",
        b: [3, 2, 1],
      },
      a: 1,
      z: "last",
    };

    expect(canonicalSerialize(inputA)).toBe(canonicalSerialize(inputB));
    expect(canonicalSerialize(inputA)).toBe(
      '{"a":1,"nested":{"a":"first","b":[3,2,1]},"z":"last"}'
    );
  });

  it("distinguishes null from undefined/absent fields", () => {
    const withNull = { a: null, b: 1 };
    const withUndefined = { a: undefined, b: 1 };
    const absent = { b: 1 };

    expect(canonicalSerialize(withNull)).toBe('{"a":null,"b":1}');
    expect(canonicalSerialize(withUndefined)).toBe('{"b":1}');
    expect(canonicalSerialize(absent)).toBe('{"b":1}');
    expect(canonicalSerialize(withNull)).not.toBe(canonicalSerialize(absent));
  });

  it("computes deterministic mutationRequestDigest", () => {
    const digest1 = computeMutationRequestDigest("user-123", "catalog:product:create", "req-abc");
    const digest2 = computeMutationRequestDigest("user-123", "catalog:product:create", "req-abc");
    const digest3 = computeMutationRequestDigest("user-123", "catalog:product:create", "req-xyz");

    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^[a-f0-9]{64}$/);
    expect(digest1).not.toBe(digest3);
  });

  it("computes deterministic requestFingerprint from normalized payload", () => {
    const payload1 = { sku: "GP-MOU-01", priceCents: 12900, title: "Mouse Pro" };
    const payload2 = { title: "Mouse Pro", priceCents: 12900, sku: "GP-MOU-01" };
    const payloadDifferent = { title: "Mouse Pro", priceCents: 14900, sku: "GP-MOU-01" };

    expect(computeRequestFingerprint(payload1)).toBe(computeRequestFingerprint(payload2));
    expect(computeRequestFingerprint(payload1)).not.toBe(
      computeRequestFingerprint(payloadDifferent)
    );
  });

  it("derives deterministic 64-bit and 32-bit advisory lock keys", () => {
    const digest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const lockKey64 = createCatalogAdvisoryLockKey(digest);
    const lockKey32 = createCatalogAdvisoryLockKey32(digest);

    expect(typeof lockKey64).toBe("bigint");
    expect(typeof lockKey32).toBe("number");
    expect(createCatalogAdvisoryLockKey(digest)).toBe(lockKey64);
  });
});
