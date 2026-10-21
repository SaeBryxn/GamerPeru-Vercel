import { describe, expect, it } from "vitest";
import { buildOrderTimeline, type CustomerOrderProgressDTO } from "@/lib/account/order-timeline";

const base: CustomerOrderProgressDTO = {
  createdAt: "2026-10-21T15:00:00.000Z",
  proofSubmittedAt: null,
  paymentConfirmedAt: null,
  shipmentStatus: "UNFULFILLED",
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  courierName: null,
  trackingNumber: null,
  trackingUrl: null,
};

const states = (steps: ReturnType<typeof buildOrderTimeline>) =>
  Object.fromEntries(steps.map((step) => [step.key, step.state]));

describe("buildOrderTimeline", () => {
  it("waits for the receipt on a new unpaid order", () => {
    expect(states(buildOrderTimeline(base, "PENDING", "UNPAID"))).toEqual({
      placed: "done",
      proof: "current",
      payment: "upcoming",
      preparing: "upcoming",
      shipped: "upcoming",
      delivered: "upcoming",
    });
  });

  it("never marks a submitted receipt as a confirmed payment", () => {
    const steps = buildOrderTimeline(
      { ...base, proofSubmittedAt: "2026-10-21T15:10:00.000Z" },
      "PENDING",
      "SUBMITTED"
    );
    expect(states(steps)).toMatchObject({ proof: "done", payment: "current" });
    expect(steps.find((step) => step.key === "proof")?.at).toBe("2026-10-21T15:10:00.000Z");
  });

  it("moves to preparation once staff approve the payment", () => {
    const steps = buildOrderTimeline(
      { ...base, paymentConfirmedAt: "2026-10-21T16:00:00.000Z", shipmentStatus: "PACKED" },
      "PROCESSING",
      "PAID"
    );
    expect(states(steps)).toMatchObject({
      proof: "done",
      payment: "done",
      preparing: "current",
      shipped: "upcoming",
    });
  });

  it("shows the courier and tracking number once shipped", () => {
    const steps = buildOrderTimeline(
      {
        ...base,
        paymentConfirmedAt: "2026-10-21T16:00:00.000Z",
        shipmentStatus: "SHIPPED",
        shippedAt: "2026-10-22T10:00:00.000Z",
        courierName: "Olva",
        trackingNumber: "ABC123",
      },
      "PROCESSING",
      "PAID"
    );
    expect(states(steps)).toMatchObject({ shipped: "done", delivered: "current" });
    expect(steps.find((step) => step.key === "shipped")?.detail).toBe("Olva · Guía ABC123");
  });

  it("completes every step when delivered", () => {
    const steps = buildOrderTimeline(
      { ...base, shipmentStatus: "DELIVERED", deliveredAt: "2026-10-23T12:00:00.000Z" },
      "FULFILLED",
      "PAID"
    );
    expect(steps.every((step) => step.state === "done")).toBe(true);
  });

  it("ends a cancelled order with the closing step and drops the rest", () => {
    const steps = buildOrderTimeline(
      { ...base, cancelledAt: "2026-10-21T15:30:00.000Z" },
      "CANCELLED",
      "UNPAID"
    );
    expect(steps.map((step) => [step.key, step.state])).toEqual([
      ["placed", "done"],
      ["closed", "closed"],
    ]);
    expect(steps.at(-1)?.label).toBe("Pedido cancelado");
  });
});
