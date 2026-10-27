import type { PermissionName, RoleName } from "@/lib/auth/rbac";

export type AdminNavGroupId = "operations" | "catalog" | "storefront" | "administration";

export interface AdminNavGroup {
  id: AdminNavGroupId;
  label: string;
}

/** Pending-work counters a destination can show next to its name (see /api/admin/attention). */
export type AdminNavBadgeKey =
  "ordersToPrepare" | "paymentsToReview" | "outOfStock" | "pendingReviews";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  group: AdminNavGroupId;
  iconName:
    | "House"
    | "ClipboardList"
    | "CreditCard"
    | "Boxes"
    | "Package"
    | "Sparkles"
    | "MessageSquareText"
    | "FolderTree"
    | "LayoutTemplate"
    | "PanelTop"
    | "Users"
    | "Cpu";
  requiredPermission?: PermissionName;
  badge?: AdminNavBadgeKey;
  description?: string;
}

export interface AdminStaffProfile {
  authUserId: string;
  email: string | null;
  roles: RoleName[];
  permissions: Set<PermissionName>;
}

export interface AdminNavigationContext {
  staff: AdminStaffProfile;
  navItems: AdminNavItem[];
}
