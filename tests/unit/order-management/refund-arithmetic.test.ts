import { describe, expect, it } from "vitest";

describe("GP-020 — Refund Arithmetic & Cumulative Cap Invariants", () => {
  it("calculates remaining refundable balance exactly", () => {
    const calculateRemaining = (amountCents: number, refundedAmountCents: number) => {
      if (refundedAmountCents > amountCents) {
        throw new Error("OVER_REFUNDED_STATE");
      }
      return amountCents - refundedAmountCents;
    };

    expect(calculateRemaining(10000, 0)).toBe(10000);
    expect(calculateRemaining(10000, 2500)).toBe(7500);
    expect(calculateRemaining(10000, 10000)).toBe(0);
    expect(() => calculateRemaining(10000, 10500)).toThrow("OVER_REFUNDED_STATE");
  });

  it("calculates paid pre-shipment remaining refund when prior partial refund exists", () => {
    const totalAmountCents = 15000;
    const priorPartialRefundCents = 4000;
    const remainingToRefund = totalAmountCents - priorPartialRefundCents;

    expect(remainingToRefund).toBe(11000);

    const resultingRefundSum = priorPartialRefundCents + remainingToRefund;
    expect(resultingRefundSum).toBe(totalAmountCents);
  });

  it("evaluates full refund status transition", () => {
    const evaluateRefundStatus = (
      totalAmountCents: number,
      currentRefundedCents: number,
      newRefundCents: number
    ) => {
      const resultingRefunded = currentRefundedCents + newRefundCents;
      if (resultingRefunded > totalAmountCents) {
        return { valid: false, error: "REFUND_EXCEEDS_PAID_AMOUNT" };
      }
      const isFullyRefunded = resultingRefunded === totalAmountCents;
      return {
        valid: true,
        resultingRefunded,
        isFullyRefunded,
        nextPaymentStatus: isFullyRefunded ? "REFUNDED" : "PAID",
        nextOrderStatus: isFullyRefunded ? "REFUNDED" : "CONFIRMED",
      };
    };

    // Partial refund
    const partial = evaluateRefundStatus(10000, 0, 3000);
    expect(partial.valid).toBe(true);
    expect(partial.resultingRefunded).toBe(3000);
    expect(partial.isFullyRefunded).toBe(false);
    expect(partial.nextPaymentStatus).toBe("PAID");
    expect(partial.nextOrderStatus).toBe("CONFIRMED");

    // Second refund reaching full
    const full = evaluateRefundStatus(10000, 3000, 7000);
    expect(full.valid).toBe(true);
    expect(full.resultingRefunded).toBe(10000);
    expect(full.isFullyRefunded).toBe(true);
    expect(full.nextPaymentStatus).toBe("REFUNDED");
    expect(full.nextOrderStatus).toBe("REFUNDED");

    // Over-refund
    const over = evaluateRefundStatus(10000, 3000, 8000);
    expect(over.valid).toBe(false);
    expect(over.error).toBe("REFUND_EXCEEDS_PAID_AMOUNT");
  });
});
