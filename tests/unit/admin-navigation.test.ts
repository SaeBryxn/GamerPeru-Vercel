import { describe, it, expect } from "vitest";
import {
  getAdminNavigation,
  groupAdminNavigation,
  CANONICAL_ADMIN_NAV_ITEMS,
} from "@/lib/admin/navigation";
import type { PermissionName } from "@/lib/auth/rbac";

describe("GP-022 / GP-024 / GP-025 / GP-027 — Admin Navigation Filtering & Scope Contract Tests", () => {
  it("D1: only implemented destinations are registered in canonical navigation", () => {
    expect(
      CANONICAL_ADMIN_NAV_ITEMS.map((item) => [item.id, item.href, item.requiredPermission ?? null])
    ).toEqual([
      ["overview", "/admin", null],
      ["orders", "/admin/orders", "orders:manage"],
      ["payment-verification", "/admin/pagos", "orders:verify"],
      ["products", "/admin/products", "catalog:manage"],
      ["taxonomy", "/admin/taxonomia", "catalog:manage"],
      ["storefront-home", "/admin/home", "catalog:manage"],
      ["storefront-menu", "/admin/menu", "catalog:manage"],
      ["ai-product-assistant", "/admin/products/ai-import", "catalog:ai_research"],
      ["ai-settings", "/admin/settings/ai", "ai:manage_credentials"],
      ["team", "/admin/equipo", "staff:manage"],
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
    expect(navCatalog.length).toBe(5);
    expect(navCatalog[0]?.href).toBe("/admin");
    expect(navCatalog[1]?.href).toBe("/admin/products");
    expect(navCatalog[2]?.href).toBe("/admin/taxonomia");
    expect(navCatalog[3]?.href).toBe("/admin/home");
    expect(navCatalog[4]?.href).toBe("/admin/menu");

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
    expect(navOrders.map((item) => item.href)).toEqual(["/admin", "/admin/orders"]);

    const verifyPerms = new Set<PermissionName>(["orders:verify"]);
    expect(getAdminNavigation(verifyPerms).map((item) => item.href)).toEqual([
      "/admin",
      "/admin/pagos",
    ]);
  });

  it("shows the team screen only with staff:manage", () => {
    const operational = new Set<PermissionName>([
      "catalog:manage",
      "catalog:publish",
      "catalog:ai_research",
      "orders:manage",
      "orders:verify",
      "support:manage",
      "support:review_rma",
    ]);
    expect(getAdminNavigation(operational).map((item) => item.href)).not.toContain("/admin/equipo");
    expect(
      getAdminNavigation(new Set<PermissionName>(["staff:manage"])).map((item) => item.href)
    ).toEqual(["/admin", "/admin/equipo"]);
  });
});

describe("Admin navigation sections", () => {
  it("groups every destination into a titled section in display order", () => {
    const groups = groupAdminNavigation(CANONICAL_ADMIN_NAV_ITEMS);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Resumen", ["overview"]],
      ["Ventas", ["orders", "payment-verification"]],
      ["Catálogo", ["products", "taxonomy"]],
      ["Tienda online", ["storefront-home", "storefront-menu"]],
      ["Inteligencia artificial", ["ai-product-assistant", "ai-settings"]],
      ["Accesos", ["team"]],
    ]);
  });

  it("drops sections the staff member cannot open", () => {
    const groups = groupAdminNavigation(getAdminNavigation(new Set(["orders:verify"])));
    expect(groups.map((group) => group.id)).toEqual(["overview", "sales"]);
  });
});
