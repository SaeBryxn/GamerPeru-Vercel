import { formatCentsToPen } from "@/lib/admin/dashboard-format";
import type { AdminOrderListRow } from "@/lib/admin/orders/types";
import { ORDER_STATUSES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from "./order-status-options";

export const orderLabels = Object.fromEntries(ORDER_STATUSES) as Record<
  AdminOrderListRow["orderStatus"],
  string
>;
export const paymentLabels = Object.fromEntries(PAYMENT_STATUSES) as Record<
  AdminOrderListRow["paymentStatus"],
  string
>;
export const shipmentLabels = {
  ...Object.fromEntries(SHIPMENT_STATUSES),
  MULTIPLE: "Múltiples envíos",
} as Record<AdminOrderListRow["shipmentStatus"], string>;

export const limaDateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatMoney(row: AdminOrderListRow): string {
  if (!Number.isSafeInteger(row.totalCents) || row.totalCents < 0) return "Importe no disponible";
  if (row.currency === "PEN") return formatCentsToPen(BigInt(row.totalCents));
  const cents = BigInt(row.totalCents);
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${row.currency} ${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (["CONFIRMED", "FULFILLED", "PAID", "DELIVERED"].includes(status)) return "success";
  if (["CANCELLED", "EXPIRED", "REJECTED"].includes(status)) return "danger";
  if (["PENDING", "UNPAID", "SUBMITTED"].includes(status)) return "warning";
  if (["PROCESSING", "VERIFYING", "SHIPPED", "MULTIPLE"].includes(status)) return "info";
  return "neutral";
}
