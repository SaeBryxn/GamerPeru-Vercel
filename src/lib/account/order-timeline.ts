import type { CustomerShipmentStatus } from "./order-status";

/** Dated facts about an order, read from the order, payment and shipment rows. */
export interface CustomerOrderProgressDTO {
  createdAt: string;
  /** Latest receipt the customer sent; null until one is submitted. */
  proofSubmittedAt: string | null;
  /** When staff approved the payment; a submitted receipt alone never sets it. */
  paymentConfirmedAt: string | null;
  shipmentStatus: CustomerShipmentStatus | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export type OrderTimelineStepState = "done" | "current" | "upcoming" | "closed";

export interface OrderTimelineStep {
  key: "placed" | "proof" | "payment" | "preparing" | "shipped" | "delivered" | "closed";
  label: string;
  state: OrderTimelineStepState;
  at: string | null;
  detail: string | null;
}

const RECEIPT_STATUSES = new Set(["SUBMITTED", "VERIFYING", "PENDING_VERIFICATION"]);
const CLOSED_LABEL: Record<string, string> = {
  CANCELLED: "Pedido cancelado",
  EXPIRED: "Pedido vencido",
  REFUNDED: "Pago reembolsado",
};

/**
 * The customer's view of an order's progress, from registration to delivery. The payment step
 * is only done once staff verify it: a submitted Yape/Plin receipt is shown as under review.
 * Closed orders keep the steps they reached and end with the closing step.
 */
export function buildOrderTimeline(
  progress: CustomerOrderProgressDTO,
  orderStatus: string,
  paymentStatus: string
): OrderTimelineStep[] {
  const shipment = progress.shipmentStatus;
  const delivered =
    orderStatus === "FULFILLED" || shipment === "DELIVERED" || progress.deliveredAt !== null;
  const shipped = delivered || shipment === "SHIPPED" || progress.shippedAt !== null;
  const paid = shipped || paymentStatus === "PAID" || progress.paymentConfirmedAt !== null;
  const receiptSent = paid || RECEIPT_STATUSES.has(paymentStatus);
  const tracking = progress.trackingNumber
    ? `${progress.courierName ? `${progress.courierName} · ` : ""}Guía ${progress.trackingNumber}`
    : progress.courierName;

  const steps: Array<Omit<OrderTimelineStep, "state"> & { done: boolean }> = [
    {
      key: "placed",
      label: "Pedido registrado",
      done: true,
      at: progress.createdAt,
      detail: null,
    },
    {
      key: "proof",
      label: "Comprobante enviado",
      done: receiptSent,
      at: progress.proofSubmittedAt,
      detail: receiptSent ? null : "Completa el pago y envía tu comprobante.",
    },
    {
      key: "payment",
      label: "Pago confirmado",
      done: paid,
      at: progress.paymentConfirmedAt,
      detail: paid ? null : "Nuestro equipo verifica el comprobante antes de confirmar.",
    },
    {
      key: "preparing",
      label: "En preparación",
      done: shipped,
      at: null,
      detail: shipped ? null : "Estamos alistando y empacando tus productos.",
    },
    {
      key: "shipped",
      label: "Enviado",
      done: shipped,
      at: progress.shippedAt,
      detail: shipped ? (tracking ?? null) : null,
    },
    {
      key: "delivered",
      label: "Entregado",
      done: delivered,
      at: progress.deliveredAt,
      detail: delivered ? null : shipped ? "Tu pedido está en camino." : null,
    },
  ];

  const closedLabel = CLOSED_LABEL[orderStatus];
  if (closedLabel) {
    return [
      ...steps
        .filter((step) => step.done)
        .map(({ done: _done, ...step }) => ({ ...step, state: "done" as const, detail: null })),
      {
        key: "closed",
        label: closedLabel,
        state: "closed",
        at: progress.cancelledAt,
        detail: null,
      },
    ];
  }

  const currentIndex = steps.findIndex((step) => !step.done);
  return steps.map(({ done, ...step }, index) => ({
    ...step,
    state: done ? "done" : index === currentIndex ? "current" : "upcoming",
    detail: done || index === currentIndex ? step.detail : null,
  }));
}
