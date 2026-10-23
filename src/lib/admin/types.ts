import type { PermissionName, RoleName } from "@/lib/auth/rbac";

export type AdminNavGroupId = "operations" | "catalog" | "storefront" | "system";

/** Collapsible entry inside a section that holds related destinations. */
export type AdminNavFolderId = "storefront-design" | "ai-engine";

export interface AdminNavFolder {
  id: AdminNavFolderId;
  label: string;
  iconName: "Palette" | "Cpu";
}

export interface AdminNavGroup {
  id: AdminNavGroupId;
  label: string;
}

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  group: AdminNavGroupId;
  folder?: AdminNavFolderId;
  iconName:
    | "Gauge"
    | "Boxes"
    | "ShoppingBag"
    | "ReceiptText"
    | "Mouse"
    | "FolderTree"
    | "LayoutTemplate"
    | "PanelTop"
    | "Sparkles"
    | "KeyRound"
    | "UserCog";
  requiredPermission?: PermissionName;
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
