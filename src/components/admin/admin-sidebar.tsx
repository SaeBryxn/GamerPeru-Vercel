"use client";

import React from "react";
import Link from "@/components/app-link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AdminNavItem } from "@/lib/admin/types";
import { AdminNavSections, type AdminNavBadges } from "./admin-nav-sections";
import styles from "./admin-shell.module.css";

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  currentPath?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  badges?: AdminNavBadges;
}

/** The wordmark, with the brand red on «Perú» only. */
export function AdminBrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return collapsed ? (
    <span className={styles.brandLogo}>
      G<span className={styles.brandAccent}>P</span>
    </span>
  ) : (
    <span className={styles.brandLogo}>
      Gamer <span className={styles.brandAccent}>Perú</span>
    </span>
  );
}

export function AdminSidebar({
  navItems,
  currentPath = "/admin",
  collapsed,
  onToggleCollapsed,
  badges,
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
            <AdminBrandMark collapsed={collapsed} />
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
            badges={badges}
          />
        </nav>
      </div>
    </aside>
  );
}
