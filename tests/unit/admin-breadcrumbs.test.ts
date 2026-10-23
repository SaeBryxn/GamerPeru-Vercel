import { describe, expect, it } from "vitest";
import { buildAdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";

const crumbs = (path: string) => buildAdminBreadcrumbs(CANONICAL_ADMIN_NAV_ITEMS, path);

describe("Admin breadcrumbs", () => {
  it("Inicio alone on the dashboard and on unknown paths", () => {
    expect(crumbs("/admin")).toEqual([{ label: "Inicio", href: null }]);
    expect(crumbs("/admin/desconocido")).toEqual([{ label: "Inicio", href: null }]);
  });

  it("a section links back to Inicio", () => {
    expect(crumbs("/admin/orders")).toEqual([
      { label: "Inicio", href: "/admin" },
      { label: "Pedidos", href: null },
    ]);
  });

  it("names sub-screens and keeps every level above a link", () => {
    expect(crumbs("/admin/orders/GP-000123")).toEqual([
      { label: "Inicio", href: "/admin" },
      { label: "Pedidos", href: "/admin/orders" },
      { label: "GP-000123", href: null },
    ]);
    expect(
      crumbs("/admin/products/018f0000-0000-7000-8000-000000000001/story").map((c) => c.label)
    ).toEqual(["Inicio", "Productos", "Detalle", "Historia"]);
    expect(crumbs("/admin/products/018f0000-0000-7000-8000-000000000001/story")[2]?.href).toBe(
      "/admin/products/018f0000-0000-7000-8000-000000000001"
    );
    expect(crumbs("/admin/products/new").at(-1)).toEqual({ label: "Nuevo", href: null });
  });
});
