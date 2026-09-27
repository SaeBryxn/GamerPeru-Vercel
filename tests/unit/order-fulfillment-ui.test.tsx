// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminOrderDetail } from "@/lib/admin/orders/types";

const actions = vi.hoisted(() => ({
  startPreparationAction: vi.fn(),
  updateTrackingAction: vi.fn(),
  dispatchOrderAction: vi.fn(),
  markDeliveredAction: vi.fn(),
}));

vi.mock("@/lib/admin/orders/fulfillment-actions", () => actions);

import { OrderFulfillment } from "@/app/admin/(protected)/orders/[orderNumber]/order-fulfillment";

type ShipmentStatus = AdminOrderDetail["shipments"][number]["status"];

function detail(
  overrides: {
    orderStatus?: AdminOrderDetail["order"]["status"];
    paymentStatus?: NonNullable<AdminOrderDetail["payment"]>["status"];
    shipmentStatus?: ShipmentStatus;
    courierName?: string | null;
  } = {}
): AdminOrderDetail {
  return {
    order: {
      orderNumber: "GP-FULFIL01",
      status: overrides.orderStatus ?? "CONFIRMED",
      createdAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
      cancelledAt: null,
      cancelReason: null,
      customerNote: null,
      currency: "PEN",
    },
    contact: {
      customerEmail: "c@example.pe",
      customerPhone: "987654321",
      accountLinkState: "LINKED",
    },
    items: [
      {
        id: "item-1",
        sku: "ATK-A9P-BLK",
        productName: "ATK A9 Plus",
        variantTitle: "Negro",
        unitPriceCents: 32900,
        quantity: 2,
        lineTotalCents: 65800,
      },
    ],
    address: {
      recipientName: "Cliente",
      phone: "987654321",
      streetAddress: "Av. Brasil 2020",
      apartmentSuite: null,
      department: "Lima",
      province: "Lima",
      district: "Jesús María",
      postalCode: null,
      referenceNotes: null,
    },
    pricing: null,
    payment: {
      methodCode: "YAPE_MANUAL",
      methodLabel: "Yape",
      status: overrides.paymentStatus ?? "PAID",
      amountCents: 67300,
      refundedAmountCents: 0,
      currency: "PEN",
      createdAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
    },
    refunds: [],
    shipments: [
      {
        id: "shipment-1",
        status: overrides.shipmentStatus ?? "UNFULFILLED",
        courierName: overrides.courierName ?? null,
        trackingNumber: null,
        trackingUrl: null,
        shippedAt: null,
        deliveredAt: null,
      },
    ],
    notes: { notes: [], olderCursor: null },
    timeline: { entries: [], olderCursor: null },
    integrityIssues: [],
    moneyActionsAllowed: true,
  };
}

const ok = (shipmentStatus: ShipmentStatus) => ({
  success: true,
  orderNumber: "GP-FULFIL01",
  orderStatus: "CONFIRMED",
  shipmentStatus,
  replayed: false,
});

describe("GP-027 — order fulfillment panel", () => {
  beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset()));
  afterEach(cleanup);

  it("points unverified payments to the verification queue instead of offering actions", () => {
    render(
      <OrderFulfillment detail={detail({ orderStatus: "PENDING", paymentStatus: "SUBMITTED" })} />
    );
    const panel = screen.getByTestId("order-fulfillment");
    expect(within(panel).getByRole("link", { name: "Ir a la cola de pagos" })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/pagos")
    );
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
  });

  it("starts preparation for a paid order", async () => {
    actions.startPreparationAction.mockResolvedValue(ok("READY_TO_PACK"));
    render(<OrderFulfillment detail={detail()} />);

    expect(screen.getByText("Paso 1 de 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar preparación/ }));

    await waitFor(() => expect(actions.startPreparationAction).toHaveBeenCalledWith("GP-FULFIL01"));
    expect(await screen.findByText("Pedido GP-FULFIL01 en preparación")).toBeTruthy();
  });

  it("requires a courier and an https link before dispatching", async () => {
    actions.dispatchOrderAction.mockResolvedValue(ok("SHIPPED"));
    render(<OrderFulfillment detail={detail({ shipmentStatus: "READY_TO_PACK" })} />);

    fireEvent.click(screen.getByRole("button", { name: /Despachar pedido/ }));
    const drawer = await screen.findByTestId("courier-drawer");
    const confirm = within(drawer).getByRole("button", { name: /Confirmar despacho/ });
    expect(confirm).toHaveProperty("disabled", true);
    expect(within(drawer).getByText(/Sale del almacén · 2 unidades/)).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", { name: "Olva Courier" }));
    fireEvent.change(within(drawer).getByLabelText(/Enlace de seguimiento/), {
      target: { value: "http://olva.example/guia" },
    });
    expect(within(drawer).getByText("El enlace debe empezar con https://")).toBeTruthy();
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.change(within(drawer).getByLabelText(/Enlace de seguimiento/), {
      target: { value: "https://olva.example/guia" },
    });
    fireEvent.change(within(drawer).getByLabelText(/Número de seguimiento/), {
      target: { value: " OLV-1 " },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(actions.dispatchOrderAction).toHaveBeenCalledWith({
        orderNumber: "GP-FULFIL01",
        courierName: "Olva Courier",
        trackingNumber: "OLV-1",
        trackingUrl: "https://olva.example/guia",
      })
    );
  });

  it("asks for confirmation before marking a shipped order as delivered", async () => {
    actions.markDeliveredAction.mockResolvedValue({ ...ok("DELIVERED"), orderStatus: "FULFILLED" });
    render(
      <OrderFulfillment detail={detail({ shipmentStatus: "SHIPPED", courierName: "Shalom" })} />
    );

    expect(screen.getByText("Shalom")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Marcar como entregado/ }));
    expect(actions.markDeliveredAction).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar entrega" }));
    await waitFor(() => expect(actions.markDeliveredAction).toHaveBeenCalledWith("GP-FULFIL01"));
  });

  it("shows the server error when a step is refused", async () => {
    actions.startPreparationAction.mockResolvedValue({
      success: false,
      code: "INVENTORY_NOT_ALLOCATED",
      error: "El stock de este pedido no está asignado; revisa la verificación del pago.",
    });
    render(<OrderFulfillment detail={detail()} />);

    fireEvent.click(screen.getByRole("button", { name: /Iniciar preparación/ }));
    expect(
      await screen.findByText(
        "El stock de este pedido no está asignado; revisa la verificación del pago."
      )
    ).toBeTruthy();
  });
});
