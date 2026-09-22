export const ORDER_STATUSES = [
  ["PENDING", "Pendiente"],
  ["CONFIRMED", "Confirmado"],
  ["PROCESSING", "En proceso"],
  ["FULFILLED", "Completado"],
  ["CANCELLED", "Cancelado"],
  ["EXPIRED", "Expirado"],
  ["REFUNDED", "Reembolsado"],
] as const;

export const PAYMENT_STATUSES = [
  ["UNPAID", "Sin pagar"],
  ["SUBMITTED", "Comprobante enviado"],
  ["VERIFYING", "En verificación"],
  ["PAID", "Pagado"],
  ["REJECTED", "Rechazado"],
  ["REFUNDED", "Reembolsado"],
  ["NOT_RECORDED", "Sin registro de pago"],
] as const;

export const SHIPMENT_STATUSES = [
  ["UNFULFILLED", "Sin preparar"],
  ["READY_TO_PACK", "Listo para preparar"],
  ["PACKED", "Empacado"],
  ["SHIPPED", "Enviado"],
  ["DELIVERED", "Entregado"],
  ["RETURNED", "Devuelto"],
  ["NOT_RECORDED", "Sin envío registrado"],
] as const;
