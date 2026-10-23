import type { PermissionName } from "@/lib/auth/rbac";
import { getLimaDateComponents, type ResolvedDashboardPeriod } from "@/lib/admin/dashboard-period";

function limaDate(instant: Date): string {
  const { year, month, day } = getLimaDateComponents(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Destinations of the dashboard's numbers, limited to screens the operator may open. */
export interface DashboardLinks {
  /** Orders created in the selected period, optionally narrowed by status. */
  periodOrders: ((filters?: Record<string, string>) => string) | null;
  /** Orders by current status, independent of the period. */
  orders: ((filters: Record<string, string>) => string) | null;
  payments: string | null;
  /** Stock screen, optionally narrowed (`stock: "low" | "out"`, `variant`). */
  inventory: ((filters?: Record<string, string>) => string) | null;
  products: ((filters?: Record<string, string>) => string) | null;
  home: string | null;
  menu: string | null;
}

export function buildDashboardLinks(
  permissions: readonly PermissionName[],
  period: ResolvedDashboardPeriod
): DashboardLinks {
  const can = (permission: PermissionName) => permissions.includes(permission);
  const query = (base: string, filters: Record<string, string> = {}) => {
    const params = new URLSearchParams(filters).toString();
    return params ? `${base}?${params}` : base;
  };
  // The orders filter takes inclusive Lima calendar days; the period end is exclusive.
  const from = limaDate(period.current.start);
  const to = limaDate(new Date(period.current.end.getTime() - 1));

  return {
    periodOrders: can("orders:manage")
      ? (filters = {}) => query("/admin/orders", { ...filters, from, to })
      : null,
    orders: can("orders:manage") ? (filters) => query("/admin/orders", filters) : null,
    payments: can("orders:verify") ? "/admin/pagos" : null,
    inventory: can("inventory:manage")
      ? (filters = {}) => query("/admin/inventario", filters)
      : null,
    products: can("catalog:manage") ? (filters = {}) => query("/admin/products", filters) : null,
    home: can("catalog:manage") ? "/admin/home" : null,
    menu: can("catalog:manage") ? "/admin/menu" : null,
  };
}
