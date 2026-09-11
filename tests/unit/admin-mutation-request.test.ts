import { describe, it, expect } from "vitest";
import {
  MutationRequestTracker,
  canonicalJsonStringify,
} from "@/lib/admin/catalog/mutation-request";

describe("GP-024 / CHK2-BR3 — Mutation Request Identity Lifecycle & Canonical Serializer Tests", () => {
  it("generates a high-entropy ID before first attempt and reuses it on retry with identical payload", () => {
    const tracker = new MutationRequestTracker();
    const payload = { name: "Mouse Pro", slug: "mouse-pro", pricePen: "299.90" };

    const id1 = tracker.getRequestId(payload);
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(20);

    // Simulate transport failure and retry with identical payload
    const id2 = tracker.getRequestId(payload);
    expect(id2).toBe(id1);
  });

  it("Test A: identical deeply nested payload => SAME request ID after transport retry", () => {
    const tracker = new MutationRequestTracker();
    const nestedPayload = {
      name: "Mouse Pro",
      brandId: "brand-1",
      initialVariant: {
        sku: "WLM-BX-BLK",
        pricePen: "199.90",
        attributes: { color: "black", edition: "limited" },
      },
      specValues: {
        sensor: "PAW3395",
        dpi_max: 26000,
      },
    };

    const id1 = tracker.getRequestId(nestedPayload);

    // Reconstructed payload with different key insertion order but identical values
    const retryPayload = {
      brandId: "brand-1",
      name: "Mouse Pro",
      specValues: {
        dpi_max: 26000,
        sensor: "PAW3395",
      },
      initialVariant: {
        attributes: { edition: "limited", color: "black" },
        pricePen: "199.90",
        sku: "WLM-BX-BLK",
      },
    };

    const id2 = tracker.getRequestId(retryPayload);
    expect(id2).toBe(id1);
  });

  it("Test B: changed initialVariant.pricePen => NEW request ID", () => {
    const tracker = new MutationRequestTracker();
    const payloadA = {
      name: "Mouse Pro",
      initialVariant: {
        sku: "WLM-BX-BLK",
        pricePen: "100.00",
      },
    };

    const id1 = tracker.getRequestId(payloadA);

    const payloadB = {
      name: "Mouse Pro",
      initialVariant: {
        sku: "WLM-BX-BLK",
        pricePen: "120.00",
      },
    };

    const id2 = tracker.getRequestId(payloadB);
    expect(id2).not.toBe(id1);
  });

  it("Test C: changed options.customSlug => NEW request ID", () => {
    const tracker = new MutationRequestTracker();
    const payloadA = {
      sourceProductId: "prod-source-1",
      options: {
        customName: "Mouse Copy",
        customSlug: "foo",
      },
    };

    const id1 = tracker.getRequestId(payloadA);

    const payloadB = {
      sourceProductId: "prod-source-1",
      options: {
        customName: "Mouse Copy",
        customSlug: "bar",
      },
    };

    const id2 = tracker.getRequestId(payloadB);
    expect(id2).not.toBe(id1);
  });

  it("Test D: changed specValues nested value => NEW request ID", () => {
    const tracker = new MutationRequestTracker();
    const payloadA = {
      productId: "prod-1",
      expectedUpdatedAt: "2026-09-11T00:00:00Z",
      specValues: {
        sensor: "PAW3395",
        dpi_max: 26000,
      },
    };

    const id1 = tracker.getRequestId(payloadA);

    const payloadB = {
      productId: "prod-1",
      expectedUpdatedAt: "2026-09-11T00:00:00Z",
      specValues: {
        sensor: "PAW3395",
        dpi_max: 30000,
      },
    };

    const id2 = tracker.getRequestId(payloadB);
    expect(id2).not.toBe(id1);
  });

  it("Test E: changed nested array content/order => fingerprint reflects the change", () => {
    const arrA = { tags: ["wireless", "magnesium"] };
    const arrB = { tags: ["magnesium", "wireless"] };
    const arrC = { tags: ["wireless", "aluminum"] };

    expect(canonicalJsonStringify(arrA)).not.toBe(canonicalJsonStringify(arrB));
    expect(canonicalJsonStringify(arrA)).not.toBe(canonicalJsonStringify(arrC));

    const tracker = new MutationRequestTracker();
    const idA = tracker.getRequestId(arrA);
    const idB = tracker.getRequestId(arrB);
    expect(idB).not.toBe(idA);
  });

  it("Test F: complete() still forces a new ID for a later logical operation", () => {
    const tracker = new MutationRequestTracker();
    const payload = { name: "Mouse Pro", slug: "mouse-pro" };

    const id1 = tracker.getRequestId(payload);
    tracker.complete(); // Definitive structured server response received

    expect(tracker.currentId).toBeNull();

    const id2 = tracker.getRequestId(payload);
    expect(id2).not.toBe(id1);
  });

  it("canonicalJsonStringify distinguishes null from undefined and rejects non-JSON primitives", () => {
    expect(canonicalJsonStringify({ val: null })).toBe('{"val":null}');
    expect(canonicalJsonStringify({ val: undefined })).toBe("{}");
    expect(canonicalJsonStringify(null)).toBe("null");

    expect(() => canonicalJsonStringify({ fn: () => {} })).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ sym: Symbol("test") })).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ big: 10n })).toThrow(TypeError);
  });

  it("rejects Date instance with TypeError", () => {
    const now = new Date();
    expect(() => canonicalJsonStringify(now)).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ createdAt: now })).toThrow(TypeError);
  });

  it("rejects Map instance with TypeError", () => {
    const map = new Map([["key", "val"]]);
    expect(() => canonicalJsonStringify(map)).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ options: map })).toThrow(TypeError);
  });

  it("rejects Set instance with TypeError", () => {
    const set = new Set([1, 2, 3]);
    expect(() => canonicalJsonStringify(set)).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ tags: set })).toThrow(TypeError);
  });

  it("rejects RegExp instance with TypeError", () => {
    const regex = /^[a-z0-9-]+$/i;
    expect(() => canonicalJsonStringify(regex)).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ pattern: regex })).toThrow(TypeError);
  });

  it("rejects custom class instance with TypeError", () => {
    class CustomPayload {
      id = "custom-1";
      name = "Custom";
    }
    const instance = new CustomPayload();
    expect(() => canonicalJsonStringify(instance)).toThrow(TypeError);
    expect(() => canonicalJsonStringify({ payload: instance })).toThrow(TypeError);
  });

  it("serializes null-prototype plain records (Object.create(null)) with nested JSON-compatible properties deterministically", () => {
    const nullProtoNested = Object.create(null);
    nullProtoNested.z = 100;
    nullProtoNested.a = "first";

    const nullProtoRoot = Object.create(null);
    nullProtoRoot.nested = nullProtoNested;
    nullProtoRoot.id = "root-1";

    const json = canonicalJsonStringify(nullProtoRoot);
    expect(json).toBe('{"id":"root-1","nested":{"a":"first","z":100}}');

    const tracker = new MutationRequestTracker();
    const id1 = tracker.getRequestId(nullProtoRoot);
    const id2 = tracker.getRequestId(nullProtoRoot);
    expect(id2).toBe(id1);
  });

  it("proves distinct unsupported object types cannot silently collapse to the same accepted '{}' fingerprint because both throw TypeError", () => {
    const setObj = new Set([1, 2]);
    const mapObj = new Map([["a", 1]]);

    expect(() => canonicalJsonStringify(setObj)).toThrow(TypeError);
    expect(() => canonicalJsonStringify(mapObj)).toThrow(TypeError);

    const tracker = new MutationRequestTracker();
    expect(() => tracker.getRequestId(setObj)).toThrow(TypeError);
    expect(() => tracker.getRequestId(mapObj)).toThrow(TypeError);
  });
});
