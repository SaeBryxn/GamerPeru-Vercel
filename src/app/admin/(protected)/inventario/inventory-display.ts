import type { StatusBadgeTone } from "@/components/admin/ui/admin-ui";

const units = new Intl.NumberFormat("es-PE");

export function formatUnits(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? units.format(value) : "Sin dato";
}

export function formatDelta(value: number) {
  if (!Number.isFinite(value)) return "Sin dato";
  return value === 0 ? "0" : `${value > 0 ? "+" : "−"}${formatUnits(Math.abs(value))}`;
}

export function stockStatus(
  available: number,
  reorderPoint: number
): {
  label: string;
  tone: StatusBadgeTone;
  key: "review" | "out" | "low" | "available" | "unknown";
} {
  if (!Number.isFinite(available)) return { label: "Sin dato", tone: "neutral", key: "unknown" };
  if (available < 0) return { label: "Revisar inventario", tone: "danger", key: "review" };
  if (available === 0) return { label: "Agotado", tone: "danger", key: "out" };
  if (available <= reorderPoint) return { label: "Stock bajo", tone: "warning", key: "low" };
  return { label: "Disponible", tone: "success", key: "available" };
}
