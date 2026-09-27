// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { VerificationDetail, VerificationQueueItem } from "@/lib/payments/verification-queue";

const actions = vi.hoisted(() => ({
  claimPaymentAction: vi.fn(),
  releasePaymentAction: vi.fn(),
  approvePaymentAction: vi.fn(),
  rejectPaymentAction: vi.fn(),
  loadVerificationDetailAction: vi.fn(),
  getProofViewUrlAction: vi.fn(),
}));

vi.mock("@/lib/payments/verification-actions", () => actions);

import { VerificationWorkspace } from "@/app/admin/(protected)/pagos/verification-workspace";

const ME = "0193a028-0000-7000-8000-0000000000a1";
const OTHER = "0193a028-0000-7000-8000-0000000000b2";
const RENDERED_AT = "2026-09-27T15:00:00.000Z";

function queueItem(overrides: Partial<VerificationQueueItem> = {}): VerificationQueueItem {
  const paymentId = overrides.paymentId ?? "0193a028-0000-7000-8000-000000000101";
  return {
    paymentId,
    paymentStatus: "SUBMITTED",
    amountCents: 34400,
    currency: "PEN",
    methodName: "Yape",
    orderId: "0193a028-0000-7000-8000-000000000201",
    orderNumber: "GP-TEST0001",
    orderStatus: "PENDING",
    customerEmail: "cliente@example.pe",
    customerPhone: "987654321",
    itemCount: 1,
    claimedByAuthUserId: null,
    claimedByEmail: null,
    claimedAt: null,
    submission: {
      id: "0193a028-0000-7000-8000-000000000301",
      attemptNumber: 1,
      operationCode: "04718233",
      submittedAt: "2026-09-27T14:40:00.000Z",
      isLate: false,
      hasProof: false,
    },
    duplicateOrderNumbers: [],
    ...overrides,
  };
}

function detail(overrides: Partial<VerificationDetail> = {}): VerificationDetail {
  return {
    paymentId: "0193a028-0000-7000-8000-000000000101",
    orderNumber: "GP-TEST0001",
    customerNotes: null,
    submissionNotes: null,
    subtotalCents: 32900,
    shippingCents: 1500,
    discountCents: 0,
    totalCents: 34400,
    orderCreatedAt: "2026-09-27T14:30:00.000Z",
    items: [],
    address: null,
    history: [],
    lateStock: null,
    ...overrides,
  };
}

function renderWorkspace(queue: VerificationQueueItem[]) {
  return render(
    <VerificationWorkspace queue={queue} currentUserId={ME} renderedAt={RENDERED_AT} />
  );
}

describe("GP-028 — payment verification queue UI", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    actions.loadVerificationDetailAction.mockResolvedValue({ success: true, detail: detail() });
  });

  afterEach(cleanup);

  it("shows the queue with fraud and lateness flags and who holds each case", () => {
    renderWorkspace([
      queueItem({ duplicateOrderNumbers: ["GP-OTHER001"] }),
      queueItem({
        paymentId: "0193a028-0000-7000-8000-000000000102",
        orderNumber: "GP-TEST0002",
        paymentStatus: "VERIFYING",
        claimedByAuthUserId: OTHER,
        claimedByEmail: "otra@gamerperu.pe",
        submission: { ...queueItem().submission, isLate: true },
      }),
    ]);

    const rows = screen.getAllByTestId("verification-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Código repetido")).toBeTruthy();
    expect(within(rows[1]!).getByText("Tardío")).toBeTruthy();
    expect(within(rows[1]!).getByText("Revisando: otra@gamerperu.pe")).toBeTruthy();

    const takenButton = within(rows[1]!).getByRole("button", {
      name: "Revisar el pago del pedido GP-TEST0002",
    });
    expect(takenButton).toHaveProperty("disabled", true);
    expect(screen.getByTestId("verification-pending-count").textContent).toBe("1");
  });

  it("filters to the operator's own cases", async () => {
    renderWorkspace([
      queueItem(),
      queueItem({
        paymentId: "0193a028-0000-7000-8000-000000000103",
        orderNumber: "GP-MINE0001",
        paymentStatus: "VERIFYING",
        claimedByAuthUserId: ME,
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Mis casos/ }));
    // The filtered-out row plays its exit animation before leaving the DOM.
    await waitFor(() => expect(screen.getAllByTestId("verification-row")).toHaveLength(1));
    const rows = screen.getAllByTestId("verification-row");
    expect(within(rows[0]!).getByText("GP-MINE0001")).toBeTruthy();
  });

  it("claims a case before opening the review drawer", async () => {
    actions.claimPaymentAction.mockResolvedValue({ success: true });
    renderWorkspace([queueItem()]);

    fireEvent.click(screen.getByRole("button", { name: "Revisar el pago del pedido GP-TEST0001" }));

    await waitFor(() => expect(screen.getByTestId("review-drawer")).toBeTruthy());
    expect(actions.claimPaymentAction).toHaveBeenCalledWith("0193a028-0000-7000-8000-000000000101");
  });

  it("reports a lost claim race instead of opening the drawer", async () => {
    actions.claimPaymentAction.mockResolvedValue({
      success: false,
      code: "CLAIMED_BY_OTHER",
      error: "Otro operador ya está revisando este pago.",
    });
    renderWorkspace([queueItem()]);

    fireEvent.click(screen.getByRole("button", { name: "Revisar el pago del pedido GP-TEST0001" }));

    expect(await screen.findByText("Otro operador ya está revisando este pago.")).toBeTruthy();
    expect(screen.queryByTestId("review-drawer")).toBeNull();
  });

  it("locks approval when a late payment has no stock and keeps terminal rejection", async () => {
    actions.loadVerificationDetailAction.mockResolvedValue({
      success: true,
      detail: detail({
        lateStock: {
          available: false,
          shortfalls: [{ sku: "ATK-A9P-WHT", needed: 2, available: 0 }],
        },
      }),
    });
    renderWorkspace([
      queueItem({
        paymentStatus: "VERIFYING",
        claimedByAuthUserId: ME,
        submission: { ...queueItem().submission, isLate: true },
      }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Continuar el pago del pedido GP-TEST0001" })
    );
    const drawer = await screen.findByTestId("review-drawer");

    expect(
      await within(drawer).findByText("Sin stock disponible - Rechazar y coordinar reembolso")
    ).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: /^Aprobar$/ })).toHaveProperty(
      "disabled",
      true
    );
    expect(within(drawer).getByRole("button", { name: /Rechazar \(reintentar\)/ })).toHaveProperty(
      "disabled",
      true
    );

    fireEvent.click(within(drawer).getByRole("button", { name: /Rechazo terminal/ }));
    const reason = within(drawer).getByLabelText("Motivo del rechazo");
    expect(reason).toHaveProperty("value", "Sin stock: coordinar reembolso con el cliente");
  });

  it("surfaces the stock error from the server and switches to terminal rejection", async () => {
    actions.approvePaymentAction.mockResolvedValue({
      success: false,
      code: "LATE_PAYMENT_STOCK_UNAVAILABLE",
      error: "Sin stock disponible - Rechazar y coordinar reembolso",
    });
    renderWorkspace([queueItem({ paymentStatus: "VERIFYING", claimedByAuthUserId: ME })]);

    fireEvent.click(
      screen.getByRole("button", { name: "Continuar el pago del pedido GP-TEST0001" })
    );
    const drawer = await screen.findByTestId("review-drawer");
    fireEvent.click(within(drawer).getByRole("button", { name: /^Aprobar$/ }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirmar aprobación" }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(actions.approvePaymentAction).toHaveBeenCalledTimes(1);
    expect(within(drawer).getByRole("button", { name: /^Aprobar$/ })).toHaveProperty(
      "disabled",
      true
    );
    expect(within(drawer).getByText("Rechazo terminal", { selector: "p" })).toBeTruthy();
  });

  it("requires a reason before a rejection can be confirmed", async () => {
    renderWorkspace([queueItem({ paymentStatus: "VERIFYING", claimedByAuthUserId: ME })]);

    fireEvent.click(
      screen.getByRole("button", { name: "Continuar el pago del pedido GP-TEST0001" })
    );
    const drawer = await screen.findByTestId("review-drawer");
    fireEvent.click(within(drawer).getByRole("button", { name: /Rechazar \(reintentar\)/ }));

    const confirm = within(drawer).getByRole("button", {
      name: "Rechazar y reabrir",
    });
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.click(
      within(drawer).getByRole("button", { name: "No se ve el código de operación" })
    );
    expect(confirm).toHaveProperty("disabled", false);
  });
});
