import { describe, it, expect } from "vitest";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";

describe("GP-024 / CHK2-BR1 — Mutation Request Identity Lifecycle Tests", () => {
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

  it("completes attempt after structured response and generates new ID for next operation", () => {
    const tracker = new MutationRequestTracker();
    const payload = { name: "Mouse Pro", slug: "mouse-pro" };

    const id1 = tracker.getRequestId(payload);
    tracker.complete(); // Structured response received

    expect(tracker.currentId).toBeNull();

    const id2 = tracker.getRequestId(payload);
    expect(id2).not.toBe(id1);
  });

  it("generates new ID if payload is materially modified after a transport failure", () => {
    const tracker = new MutationRequestTracker();
    const payloadA = { name: "Mouse Pro", slug: "mouse-pro", pricePen: "299.90" };

    const id1 = tracker.getRequestId(payloadA);

    // User edits the price to fix an error before re-submitting
    const payloadB = { name: "Mouse Pro", slug: "mouse-pro", pricePen: "349.90" };
    const id2 = tracker.getRequestId(payloadB);

    expect(id2).not.toBe(id1);
  });
});
