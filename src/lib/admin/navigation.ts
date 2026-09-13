import type { PermissionName } from "@/lib/auth/rbac";
import type { AdminNavItem } from "./types";

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
    iconName: "LayoutDashboard",
    description: "Panel principal de administración",
  },
  {
    id: "products",
    label: "Productos",
    href: "/admin/products",
    iconName: "Package",
    requiredPermission: "catalog:manage",
    description: "Gestión de catálogo y productos",
  },
  {
    id: "ai-product-assistant",
    label: "Asistente IA",
    href: "/admin/products/ai-import",
    iconName: "Bot",
    requiredPermission: "catalog:ai_research",
    description: "Investigación y revisión asistida de productos",
  },
  {
    id: "ai-settings",
    label: "Configuración IA",
    href: "/admin/settings/ai",
    iconName: "Settings2",
    requiredPermission: "ai:manage_credentials",
    description: "Proveedores, credenciales y perfiles de IA",
  },
];

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
