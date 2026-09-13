import React from "react";
import Link from "next/link";
import { Bot, LayoutDashboard, Package, Settings2 } from "lucide-react";
import type { AdminNavItem, AdminStaffProfile } from "@/lib/admin/types";
import styles from "./admin-shell.module.css";

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  staff: AdminStaffProfile;
  currentPath?: string;
}

export function AdminSidebar({ navItems, staff, currentPath = "/admin" }: AdminSidebarProps) {
  const iconMap = { LayoutDashboard, Package, Bot, Settings2 };
  return (
    <aside className={styles.sidebar} aria-label="Navegación administrativa">
      <div>
        <Link href="/admin" className={styles.sidebarBrand}>
          <span className={styles.brandLogo}>Gamer Perú</span>
          <span className={styles.brandBadge}>ADMIN</span>
        </Link>

        <div>
          <div className={styles.navSectionTitle}>Principal</div>
          <nav aria-label="Secciones del panel">
            <ul className={styles.navList}>
              {navItems.map((item) => {
                const isActive =
                  currentPath === item.href ||
                  (item.href !== "/admin" &&
                    currentPath.startsWith(`${item.href}/`) &&
                    !navItems.some(
                      (candidate) =>
                        candidate.href.length > item.href.length &&
                        (currentPath === candidate.href ||
                          currentPath.startsWith(`${candidate.href}/`))
                    ));
                const IconComponent =
                  iconMap[item.iconName as keyof typeof iconMap] ?? LayoutDashboard;
                return (
                  <li key={item.id} className={styles.navItem}>
                    <Link
                      href={item.href}
                      className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <IconComponent className={styles.navIcon} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      <div className={styles.staffProfileCard}>
        <span className={styles.staffEmail}>{staff.email ?? staff.authUserId}</span>
        <div className={styles.staffRoles}>
          {staff.roles.map((role) => (
            <span key={role} className={styles.rolePill}>
              {role}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
