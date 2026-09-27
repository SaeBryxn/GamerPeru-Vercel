import { describe, it, expect } from "vitest";
import { getAdminNavigation, CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";
import type { PermissionName } from "@/lib/auth/rbac";

describe("GP-022 / GP-024 / GP-025 — Admin Navigation Filtering & Scope Contract Tests", () => {
  it("D1: only implemented destinations are registered in canonical navigation", () => {
    expect(
      CANONICAL_ADMIN_NAV_ITEMS.map((item) => [item.id, item.href, item.requiredPermission ?? null])
    ).toEqual([
      ["overview", "/admin", null],
      ["payment-verification", "/admin/pagos", "orders:verify"],
      ["products", "/admin/products", "catalog:manage"],
      ["taxonomy", "/admin/taxonomia", "catalog:manage"],
      ["storefront-menu", "/admin/menu", "catalog:manage"],
      ["ai-product-assistant", "/admin/products/ai-import", "catalog:ai_research"],
      ["ai-settings", "/admin/settings/ai", "ai:manage_credentials"],
    ]);
  });

  it("D2: proves no dead future Admin links exist in navigation", () => {
    const futureHrefs = [
      "/admin/dashboard",
      "/admin/productos",
      "/admin/pedidos",
      "/admin/inventario",
      "/admin/clientes",
      "/admin/asistente-ia",
    ];

    CANONICAL_ADMIN_NAV_ITEMS.forEach((item) => {
      expect(futureHrefs).not.toContain(item.href);
    });
  });

  it("D3: returns destinations filtered by authorized staff permissions", () => {
    const catalogPerms = new Set<PermissionName>(["catalog:manage"]);
    const navCatalog = getAdminNavigation(catalogPerms);
    expect(navCatalog.length).toBe(4);
    expect(navCatalog[0]?.href).toBe("/admin");
    expect(navCatalog[1]?.href).toBe("/admin/products");
    expect(navCatalog[2]?.href).toBe("/admin/taxonomia");
    expect(navCatalog[3]?.href).toBe("/admin/menu");

    const researchPerms = new Set<PermissionName>(["catalog:ai_research"]);
    expect(getAdminNavigation(researchPerms).map((item) => item.href)).toEqual([
      "/admin",
      "/admin/products/ai-import",
    ]);

    const credentialsPerms = new Set<PermissionName>(["ai:manage_credentials"]);
    expect(getAdminNavigation(credentialsPerms).map((item) => item.href)).toEqual([
      "/admin",
      "/admin/settings/ai",
    ]);

    const ordersPerms = new Set<PermissionName>(["orders:manage"]);
    const navOrders = getAdminNavigation(ordersPerms);
    expect(navOrders.length).toBe(1);
    expect(navOrders[0]?.href).toBe("/admin");

    const verifyPerms = new Set<PermissionName>(["orders:verify"]);
    expect(getAdminNavigation(verifyPerms).map((item) => item.href)).toEqual([
      "/admin",
      "/admin/pagos",
    ]);
  });
});
