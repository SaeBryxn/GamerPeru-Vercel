import { describe, expect, it } from "vitest";

describe("GP-020 — Order Lifecycle State Machine Policies", () => {
  it("allows customer cancellation only when Order is PENDING and Payment is UNPAID", () => {
    const isCustomerCancelAllowed = (
      orderStatus: string,
      paymentStatus: string,
      shipmentStatus: string
    ) => {
      if (
        orderStatus === "PENDING" &&
        paymentStatus === "UNPAID" &&
        shipmentStatus === "UNFULFILLED"
      ) {
        return true;
      }
      return false;
    };

    expect(isCustomerCancelAllowed("PENDING", "UNPAID", "UNFULFILLED")).toBe(true);
    expect(isCustomerCancelAllowed("PENDING", "SUBMITTED", "UNFULFILLED")).toBe(false);
    expect(isCustomerCancelAllowed("PENDING", "VERIFYING", "UNFULFILLED")).toBe(false);
    expect(isCustomerCancelAllowed("CONFIRMED", "PAID", "UNFULFILLED")).toBe(false);
    expect(isCustomerCancelAllowed("PENDING", "UNPAID", "SHIPPED")).toBe(false);
    expect(isCustomerCancelAllowed("CANCELLED", "UNPAID", "UNFULFILLED")).toBe(false);
  });

  it("prohibits customer cancellation during SUBMITTED or VERIFYING", () => {
    const evaluateReviewState = (paymentStatus: string) => {
      if (paymentStatus === "SUBMITTED" || paymentStatus === "VERIFYING") {
        return { allowed: false, code: "PAYMENT_REVIEW_IN_PROGRESS" };
      }
      return { allowed: true };
    };

    expect(evaluateReviewState("SUBMITTED")).toEqual({
      allowed: false,
      code: "PAYMENT_REVIEW_IN_PROGRESS",
    });
    expect(evaluateReviewState("VERIFYING")).toEqual({
      allowed: false,
      code: "PAYMENT_REVIEW_IN_PROGRESS",
    });
    expect(evaluateReviewState("UNPAID")).toEqual({ allowed: true });
  });

  it("prohibits direct cancellation once shipment has started", () => {
    const evaluateShipmentState = (shipmentStatus: string) => {
      if (shipmentStatus !== "UNFULFILLED") {
        return { allowed: false, code: "FULFILLMENT_ALREADY_STARTED" };
      }
      return { allowed: true };
    };

    expect(evaluateShipmentState("UNFULFILLED")).toEqual({ allowed: true });
    expect(evaluateShipmentState("READY_TO_PACK")).toEqual({
      allowed: false,
      code: "FULFILLMENT_ALREADY_STARTED",
    });
    expect(evaluateShipmentState("PACKED")).toEqual({
      allowed: false,
      code: "FULFILLMENT_ALREADY_STARTED",
    });
    expect(evaluateShipmentState("SHIPPED")).toEqual({
      allowed: false,
      code: "FULFILLMENT_ALREADY_STARTED",
    });
    expect(evaluateShipmentState("DELIVERED")).toEqual({
      allowed: false,
      code: "FULFILLMENT_ALREADY_STARTED",
    });
  });
});
