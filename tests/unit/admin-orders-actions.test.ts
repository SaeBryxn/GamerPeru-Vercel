import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/orders/guard", () => ({ requireOrdersAdmin: vi.fn() }));
vi.mock("@/lib/orders/service", () => ({
  cancelUnpaidOrder: vi.fn(),
  cancelPaidPreShipmentAndRefund: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireOrdersAdmin } from "@/lib/admin/orders/guard";
import {
  cancelAdminPaidOrderAction,
  cancelAdminUnpaidOrderAction,
} from "@/lib/admin/orders/actions";
import { cancelPaidPreShipmentAndRefund, cancelUnpaidOrder } from "@/lib/orders/service";

const allowed = { authorized: true, context: { authUserId: randomUUID() } };

describe("GP-027 CHK1 cancellation wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrdersAdmin).mockResolvedValue(allowed as never);
  });

  it("fails closed before invoking GP-020", async () => {
    vi.mocked(requireOrdersAdmin).mockResolvedValue({ authorized: false, code: "NOT_AVAILABLE" });
    expect(await cancelAdminUnpaidOrderAction(undefined)).toEqual({
      success: false,
      code: "NOT_AVAILABLE",
    });
    expect(cancelUnpaidOrder).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("requires an explicit reason and stable UUID before unpaid delegation", async () => {
    const cancellationAttemptId = randomUUID();
    for (const reason of [undefined, null, 1, "  ", "x".repeat(256), "bad\u202Etext"]) {
      expect(
        await cancelAdminUnpaidOrderAction({
          orderNumber: "GP-027-A",
          reason,
          cancellationAttemptId,
        })
      ).toEqual({ success: false, code: "INVALID_INPUT" });
    }
    expect(cancelUnpaidOrder).not.toHaveBeenCalled();
    vi.mocked(cancelUnpaidOrder).mockResolvedValue({
      success: true,
      orderNumber: "GP-027-A",
      status: "CANCELLED",
      replayed: false,
    });
    expect(
      await cancelAdminUnpaidOrderAction({
        orderNumber: "gp-027-a",
        reason: "  Solicitud del operador  ",
        cancellationAttemptId,
      })
    ).toMatchObject({ success: true, status: "CANCELLED" });
    expect(cancelUnpaidOrder).toHaveBeenCalledExactlyOnceWith({
      orderNumber: "GP-027-A",
      reason: "Solicitud del operador",
      cancellationAttemptId,
    });
  });

  it("requires external-refund attestation and delegates paid cancellation unchanged", async () => {
    const cancellationAttemptId = randomUUID();
    const input = {
      orderNumber: "GP-027-B",
      reason: "Reembolso manual confirmado",
      cancellationAttemptId,
      externalReference: "REF-ABC",
    };
    expect(await cancelAdminPaidOrderAction(input)).toEqual({
      success: false,
      code: "INVALID_INPUT",
    });
    expect(cancelPaidPreShipmentAndRefund).not.toHaveBeenCalled();
    vi.mocked(cancelPaidPreShipmentAndRefund).mockResolvedValue({
      success: true,
      orderNumber: "GP-027-B",
      status: "REFUNDED",
      refundedAmountCents: 100,
      replayed: false,
    });
    expect(
      await cancelAdminPaidOrderAction({ ...input, externalRefundCompleted: true })
    ).toMatchObject({
      success: true,
      refundedAmountCents: 100,
    });
    expect(cancelPaidPreShipmentAndRefund).toHaveBeenCalledExactlyOnceWith({
      orderNumber: input.orderNumber,
      reason: input.reason,
      cancellationAttemptId,
      externalReference: input.externalReference,
    });
  });
});
