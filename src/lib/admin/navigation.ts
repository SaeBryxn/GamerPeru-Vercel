import type { PermissionName } from "@/lib/auth/rbac";
import type { AdminNavGroup, AdminNavItem } from "./types";

/** Sidebar sections, in display order; each one gets its own color in the shell. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { id: "overview", label: "Resumen", hint: "Lo que pide tu atención hoy" },
  { id: "sales", label: "Ventas", hint: "Pedidos y comprobantes de pago" },
  { id: "catalog", label: "Catálogo", hint: "Productos, fotos, categorías y marcas" },
  { id: "storefront", label: "Tienda online", hint: "Portada, imágenes, videos y menú" },
  { id: "ai", label: "Inteligencia artificial", hint: "Investigación y proveedores de IA" },
  { id: "access", label: "Accesos", hint: "Quién entra al panel" },
];

/**
 * Canonical Gamer Perú Admin Navigation Items
 *
 * Scope Rule (GP-022):
 * Only implemented and verified destinations are exposed in active navigation.
 * No dead links or placeholders for future milestones are rendered in live navigation.
 */
export const CANONICAL_ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "overview",
    label: "Inicio",
    href: "/admin",
    group: "overview",
    iconName: "Gauge",
    description: "Panel principal de administración",
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/admin/orders",
    group: "sales",
    iconName: "ShoppingBag",
    requiredPermission: "orders:manage",
    description: "Gestión y seguimiento de pedidos",
  },
  {
    id: "payment-verification",
    label: "Pagos",
    href: "/admin/pagos",
    group: "sales",
    iconName: "ReceiptText",
    requiredPermission: "orders:verify",
    description: "Cola de comprobantes Yape/Plin por verificar",
  },
  {
    id: "products",
    label: "Productos",
    href: "/admin/products",
    group: "catalog",
    iconName: "Mouse",
    requiredPermission: "catalog:manage",
    description: "Gestión de catálogo y productos",
  },
  {
    id: "taxonomy",
    label: "Categorías y marcas",
    href: "/admin/taxonomia",
    group: "catalog",
    iconName: "FolderTree",
    requiredPermission: "catalog:manage",
    description: "Árbol del catálogo: categorías y marcas",
  },
  {
    id: "storefront-home",
    label: "Home de la tienda",
    href: "/admin/home",
    group: "storefront",
    iconName: "LayoutTemplate",
    requiredPermission: "catalog:manage",
    description: "Secciones, textos, imágenes y videos de la portada",
  },
  {
    id: "storefront-menu",
    label: "Menú de la tienda",
    href: "/admin/menu",
    group: "storefront",
    iconName: "PanelTop",
    requiredPermission: "catalog:manage",
    description: "Qué secciones ve el cliente en la barra superior",
  },
  {
    id: "ai-product-assistant",
    label: "Asistente IA",
    href: "/admin/products/ai-import",
    group: "ai",
    iconName: "Sparkles",
    requiredPermission: "catalog:ai_research",
    description: "Investigación y revisión asistida de productos",
  },
  {
    id: "ai-settings",
    label: "Configuración IA",
    href: "/admin/settings/ai",
    group: "ai",
    iconName: "KeyRound",
    requiredPermission: "ai:manage_credentials",
    description: "Proveedores, credenciales y perfiles de IA",
  },
  {
    id: "team",
    label: "Equipo",
    href: "/admin/equipo",
    group: "access",
    iconName: "UserCog",
    requiredPermission: "staff:manage",
    description: "Quién accede al panel y con qué nivel",
  },
];

/** The visible items split into their sections; sections left empty by permissions are dropped. */
export function groupAdminNavigation(
  items: AdminNavItem[]
): Array<AdminNavGroup & { items: AdminNavItem[] }> {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

/**
 * Filters the canonical admin navigation items based on the staff user's permissions.
 */
export function getAdminNavigation(permissions: Set<PermissionName>): AdminNavItem[] {
  return CANONICAL_ADMIN_NAV_ITEMS.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return permissions.has(item.requiredPermission);
  });
}
