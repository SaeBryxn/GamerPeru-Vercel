import type { PermissionName, RoleName } from "@/lib/auth/rbac";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  iconName:
    | "LayoutDashboard"
    | "Package"
    | "ShoppingCart"
    | "CheckCircle"
    | "Boxes"
    | "Users"
    | "LifeBuoy"
    | "Settings"
    | "Bot"
    | "Settings2"
    | "Tags"
    | "Menu";
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
