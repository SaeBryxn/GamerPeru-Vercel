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
      ["inventory", "/admin/inventario", "inventory:manage"],
      ["products", "/admin/products", "catalog:manage"],
      ["ai-product-assistant", "/admin/products/ai-import", "catalog:ai_research"],
      ["reviews", "/admin/resenas", "catalog:manage"],
      ["taxonomy", "/admin/taxonomia", "catalog:manage"],
      ["storefront-home", "/admin/home", "catalog:manage"],
      ["storefront-menu", "/admin/menu", "catalog:manage"],
      ["team", "/admin/equipo", "staff:manage"],
      ["ai-settings", "/admin/settings/ai", "ai:manage_credentials"],
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
    expect(navCatalog.length).toBe(6);
    expect(navCatalog[0]?.href).toBe("/admin");
    expect(navCatalog[1]?.href).toBe("/admin/products");
    expect(navCatalog[2]?.href).toBe("/admin/resenas");
    expect(navCatalog[3]?.href).toBe("/admin/taxonomia");
    expect(navCatalog[4]?.href).toBe("/admin/home");
    expect(navCatalog[5]?.href).toBe("/admin/menu");

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
    ).map((group) => [group.label, group.items.map((item) => item.label)]);

  it("groups destinations into four sections in display order", () => {
    expect(shape()).toEqual([
      ["Operaciones", ["Inicio", "Pedidos", "Pagos", "Inventario"]],
      ["Catálogo", ["Productos", "Importar con IA", "Reseñas", "Categorías y marcas"]],
      ["Tienda online", ["Página de inicio", "Menú y navegación"]],
      ["Administración", ["Equipo", "Inteligencia artificial"]],
    ]);
  });

  it("drops sections the staff member cannot open", () => {
    expect(shape(new Set<PermissionName>(["ai:manage_credentials"]))).toEqual([
      ["Operaciones", ["Inicio"]],
      ["Administración", ["Inteligencia artificial"]],
    ]);
  });
});
