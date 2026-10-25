import { describe, it, expect, vi, afterEach } from "vitest";

const features = vi.hoisted(() => ({ aiAssistant: true }));
vi.mock("@/config/features", () => ({
  get AI_ASSISTANT_ENABLED() {
    return features.aiAssistant;
  },
}));

afterEach(() => {
  features.aiAssistant = true;
});
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
      ["inventory", "/admin/inventario", "inventory:manage"],
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

    features.aiAssistant = false;
    expect(getAdminNavigation(researchPerms).map((item) => item.href)).toEqual(["/admin"]);
    features.aiAssistant = true;

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
  const shape = (permissions?: Set<PermissionName>) =>
    groupAdminNavigation(
      permissions ? getAdminNavigation(permissions) : CANONICAL_ADMIN_NAV_ITEMS
    ).map((group) => [
      group.label,
      group.entries.map((entry) =>
        entry.kind === "item"
          ? entry.item.id
          : [entry.folder.label, entry.items.map((item) => item.id)]
      ),
    ]);

  it("groups destinations into sections with collapsible folders in display order", () => {
    expect(shape()).toEqual([
      ["Operaciones", ["overview", "orders", "payment-verification", "inventory"]],
      ["Catálogo", ["products", "taxonomy"]],
      ["Tienda y contenido", [["Diseño de tienda", ["storefront-home", "storefront-menu"]]]],
      ["IA y sistema", [["Motor IA", ["ai-product-assistant", "ai-settings"]], "team"]],
    ]);
  });

  it("drops sections and folders the staff member cannot open", () => {
    expect(shape(new Set<PermissionName>(["ai:manage_credentials"]))).toEqual([
      ["Operaciones", ["overview"]],
      ["IA y sistema", [["Motor IA", ["ai-settings"]]]],
    ]);
  });
});
