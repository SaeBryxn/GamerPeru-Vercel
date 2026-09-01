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
