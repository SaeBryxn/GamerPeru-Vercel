import { formatCentsToPen } from "@/lib/admin/dashboard-format";

const limaDateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatLimaDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : limaDateTime.format(date);
}

export function formatStoredAmount(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "Datos de pedido no disponibles";
  if (currency === "PEN") return formatCentsToPen(BigInt(cents));
  const exact = BigInt(cents);
  const whole = (exact / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${whole}.${(exact % 100n).toString().padStart(2, "0")}`;
}
