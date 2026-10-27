import { AI_ASSISTANT_ENABLED } from "@/config/features";
import type { PermissionName } from "@/lib/auth/rbac";
import type { AdminNavGroup, AdminNavItem } from "./types";

/** Sidebar sections, in display order. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { id: "operations", label: "Operaciones" },
  { id: "catalog", label: "Catálogo" },
  { id: "storefront", label: "Tienda online" },
  { id: "administration", label: "Administración" },
];

/**
 * Canonical Gamer Perú Admin Navigation Items, in display order.
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
    group: "operations",
    iconName: "House",
    description: "Resumen de la tienda",
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/admin/orders",
    group: "operations",
    iconName: "ClipboardList",
    requiredPermission: "orders:manage",
    badge: "ordersToPrepare",
    description: "Gestión y seguimiento de pedidos",
  },
  {
    id: "payment-verification",
    label: "Pagos",
    href: "/admin/pagos",
    group: "operations",
    iconName: "CreditCard",
    requiredPermission: "orders:verify",
    badge: "paymentsToReview",
    description: "Cola de comprobantes Yape/Plin por verificar",
  },
  {
    id: "inventory",
    label: "Inventario",
    href: "/admin/inventario",
    group: "operations",
    iconName: "Boxes",
    requiredPermission: "inventory:manage",
    badge: "outOfStock",
    description: "Existencias, conteos y movimientos del almacén principal",
  },
  {
    id: "products",
    label: "Productos",
    href: "/admin/products",
    group: "catalog",
    iconName: "Package",
    requiredPermission: "catalog:manage",
    description: "Gestión de catálogo y productos",
  },
  {
    id: "ai-product-assistant",
    label: "Importar con IA",
    href: "/admin/products/ai-import",
    group: "catalog",
    iconName: "Sparkles",
    requiredPermission: "catalog:ai_research",
    description: "Investigación y revisión asistida de productos",
  },
  {
    id: "reviews",
    label: "Reseñas",
    href: "/admin/resenas",
    group: "catalog",
    iconName: "MessageSquareText",
    requiredPermission: "catalog:manage",
    badge: "pendingReviews",
    description: "Opiniones de compradores por aprobar antes de publicarlas",
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
    label: "Página de inicio",
    href: "/admin/home",
    group: "storefront",
    iconName: "LayoutTemplate",
    requiredPermission: "catalog:manage",
    description: "Secciones, textos, imágenes y videos de la portada",
  },
  {
    id: "storefront-menu",
    label: "Menú y navegación",
    href: "/admin/menu",
    group: "storefront",
    iconName: "PanelTop",
    requiredPermission: "catalog:manage",
    description: "Qué secciones ve el cliente en la barra superior",
  },
  {
    id: "team",
    label: "Equipo",
    href: "/admin/equipo",
    group: "administration",
    iconName: "Users",
    requiredPermission: "staff:manage",
    description: "Quién accede al panel y con qué nivel",
  },
  {
    id: "ai-settings",
    label: "Inteligencia artificial",
    href: "/admin/settings/ai",
    group: "administration",
    iconName: "Cpu",
    requiredPermission: "ai:manage_credentials",
    description: "Proveedores, credenciales y perfiles de IA",
  },
];

/** The visible items split into their sections, in display order. Empty sections are dropped. */
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
    if (item.id === "ai-product-assistant" && !AI_ASSISTANT_ENABLED) {
      return false;
    }
    if (!item.requiredPermission) {
      return true;
    }
    return permissions.has(item.requiredPermission);
  });
}
