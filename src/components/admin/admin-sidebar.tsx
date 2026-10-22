"use client";

import React from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AdminNavItem, AdminStaffProfile } from "@/lib/admin/types";
import { AdminNavSections } from "./admin-nav-sections";
import styles from "./admin-shell.module.css";

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  staff: AdminStaffProfile;
  currentPath?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function AdminSidebar({
  navItems,
  staff,
  currentPath = "/admin",
  collapsed,
  onToggleCollapsed,
}: AdminSidebarProps) {
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
      aria-label="Navegación administrativa"
    >
      <div className={styles.sidebarTop}>
        <div className={styles.sidebarBrandRow}>
          <Link href="/admin" className={styles.sidebarBrand} aria-label="Gamer Perú admin">
            <span className={styles.brandLogo}>{collapsed ? "GP" : "Gamer Perú"}</span>
            {!collapsed && <span className={styles.brandBadge}>ADMIN</span>}
          </Link>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            <ToggleIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Secciones del panel" className={styles.sidebarNav}>
          <AdminNavSections
            navItems={navItems}
            currentPath={currentPath}
            markerId="admin-nav-active"
            collapsed={collapsed}
          />
        </nav>
      </div>

      <div
        className={styles.staffProfileCard}
        title={collapsed ? (staff.email ?? undefined) : undefined}
      >
        <span className={styles.staffAvatar} aria-hidden="true">
          {(staff.email ?? "A").slice(0, 1).toUpperCase()}
        </span>
        <span className={collapsed ? styles.visuallyHidden : styles.staffDetails}>
          <span className={styles.staffEmail}>{staff.email ?? staff.authUserId}</span>
          <span className={styles.staffRoles}>
            {staff.roles.map((role) => (
              <span key={role} className={styles.rolePill}>
                {role}
              </span>
            ))}
          </span>
        </span>
      </div>
    </aside>
  );
}
