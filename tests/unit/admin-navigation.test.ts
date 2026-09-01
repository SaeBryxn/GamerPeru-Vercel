import { describe, it, expect } from "vitest";
import { getAdminNavigation, CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";
import type { PermissionName } from "@/lib/auth/rbac";

describe("GP-022 — Admin Navigation Filtering & Scope Contract Tests", () => {
  it("D1: only implemented destinations are registered in canonical navigation", () => {
    // In GP-022, only the /admin overview destination is implemented
    expect(CANONICAL_ADMIN_NAV_ITEMS.length).toBe(1);
    expect(CANONICAL_ADMIN_NAV_ITEMS[0]?.href).toBe("/admin");
    expect(CANONICAL_ADMIN_NAV_ITEMS[0]?.id).toBe("overview");
  });

  it("D2: proves no dead future Admin links exist in GP-022 navigation", () => {
    const futureHrefs = [
      "/admin/dashboard",
      "/admin/productos",
      "/admin/pedidos",
      "/admin/pagos",
      "/admin/inventario",
      "/admin/clientes",
      "/admin/asistente-ia",
    ];

    CANONICAL_ADMIN_NAV_ITEMS.forEach((item) => {
      expect(futureHrefs).not.toContain(item.href);
    });
  });

  it("D3: returns Overview destination for all authorized staff permissions", () => {
    const catalogPerms = new Set<PermissionName>(["catalog:manage"]);
    const navCatalog = getAdminNavigation(catalogPerms);
    expect(navCatalog.length).toBe(1);
    expect(navCatalog[0]?.href).toBe("/admin");

    const ordersPerms = new Set<PermissionName>(["orders:manage"]);
    const navOrders = getAdminNavigation(ordersPerms);
    expect(navOrders.length).toBe(1);
    expect(navOrders[0]?.href).toBe("/admin");
  });
});
