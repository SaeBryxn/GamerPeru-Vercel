import type { CustomerOrderProgressDTO } from "@/lib/account/order-timeline";

/** Display state only. Payment submission and order mutations remain server-authorized. */
export function describeConfirmation(
  orderStatus: string,
  paymentStatus: string,
  progress: CustomerOrderProgressDTO
) {
  const closed = ["CANCELLED", "EXPIRED", "REFUNDED"].includes(orderStatus);
  const delivered =
    orderStatus === "FULFILLED" ||
    progress.shipmentStatus === "DELIVERED" ||
    !!progress.deliveredAt;
  const shipped = delivered || progress.shipmentStatus === "SHIPPED" || !!progress.shippedAt;
  const paid = paymentStatus === "PAID" || !!progress.paymentConfirmedAt;
  const review = ["SUBMITTED", "VERIFYING", "PENDING_VERIFICATION"].includes(paymentStatus);
  const needsPayment = !closed && !shipped && !paid && !review;
  let title = "Tu pedido está registrado";
  let lead = "Realiza el pago y envía tu comprobante para que podamos verificarlo.";
  let label = "Pendiente de pago";
  let tone = "pending";
  if (review) {
    title = "Recibimos tu comprobante";
    lead = "Estamos verificando tu pago. No necesitas volver a pagar ni enviar el comprobante.";
    label = "En revisión";
  } else if (paymentStatus === "REJECTED") {
    title = "Tu pago necesita una revisión";
    lead =
      "El comprobante no pudo aprobarse. Revisa los datos antes de enviarlo de nuevo o contáctanos.";
    label = "Pago rechazado";
  } else if (paid) {
    title = "Estamos preparando tu pedido";
    lead =
      "Tu pago está confirmado. Aquí aparecerá la información del envío cuando esté disponible.";
    label = "En preparación";
    tone = "progress";
  }
  if (shipped) {
    title = "Tu pedido va en camino";
    lead = "Tu pedido ya fue despachado. Consulta el courier y la guía en el seguimiento.";
    label = "En camino";
    tone = "progress";
  }
  if (delivered) {
    title = "¡Pedido entregado!";
    lead =
      "Gracias por elegir Gamer Perú. Tus productos y los detalles de tu compra quedan aquí, a mano.";
    label = "Entregado";
    tone = "success";
  }
  if (closed) {
    tone = "closed";
    if (orderStatus === "EXPIRED") {
      title = "El pedido ha vencido";
      lead =
        "La reserva terminó. Puedes volver al catálogo para consultar la disponibilidad actual.";
      label = "Vencido";
    } else if (orderStatus === "REFUNDED") {
      title = "Pago reembolsado";
      lead =
        "El pedido figura como reembolsado. Si necesitas revisar algún detalle, contáctanos con tu número de pedido.";
      label = "Reembolsado";
    } else {
      title = "Pedido Cancelado";
      lead =
        "Este pedido ha sido cancelado. Puedes consultar el catálogo si deseas realizar una nueva compra.";
      label = "Cancelado";
    }
  }
  return { title, lead, label, tone, closed, delivered, shipped, paid, review, needsPayment };
}
