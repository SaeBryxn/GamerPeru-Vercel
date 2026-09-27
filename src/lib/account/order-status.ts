export type CustomerOrderStatus =
  "PENDING" | "CONFIRMED" | "PROCESSING" | "FULFILLED" | "CANCELLED" | "EXPIRED" | "REFUNDED";

export type CustomerShipmentStatus =
  "UNFULFILLED" | "READY_TO_PACK" | "PACKED" | "SHIPPED" | "DELIVERED" | "RETURNED";

export type OrderStatusTone = "pending" | "progress" | "transit" | "success" | "muted";

export interface CustomerOrderStatusView {
  label: string;
  tone: OrderStatusTone;
  /** On its way to the customer: the account surfaces these with the brand-red notification. */
  isInTransit: boolean;
}

/**
 * What the customer sees for an order. The shipment wins once it has left the warehouse, since
 * "Enviado" says more than the payment-side order status; closed orders keep their own label.
 */
export function describeCustomerOrder(
  orderStatus: CustomerOrderStatus,
  shipmentStatus: CustomerShipmentStatus | null
): CustomerOrderStatusView {
  switch (orderStatus) {
    case "CANCELLED":
      return { label: "Cancelado", tone: "muted", isInTransit: false };
    case "EXPIRED":
      return { label: "Vencido", tone: "muted", isInTransit: false };
    case "REFUNDED":
      return { label: "Reembolsado", tone: "muted", isInTransit: false };
    case "FULFILLED":
      return { label: "Entregado", tone: "success", isInTransit: false };
    case "PENDING":
      return { label: "Pago pendiente", tone: "pending", isInTransit: false };
    default:
      break;
  }

  switch (shipmentStatus) {
    case "DELIVERED":
      return { label: "Entregado", tone: "success", isInTransit: false };
    case "SHIPPED":
      return { label: "Enviado", tone: "transit", isInTransit: true };
    case "RETURNED":
      return { label: "Devuelto", tone: "muted", isInTransit: false };
    case "READY_TO_PACK":
    case "PACKED":
      return { label: "En preparación", tone: "progress", isInTransit: false };
    default:
      return orderStatus === "PROCESSING"
        ? { label: "En preparación", tone: "progress", isInTransit: false }
        : { label: "Pago confirmado", tone: "progress", isInTransit: false };
  }
}
