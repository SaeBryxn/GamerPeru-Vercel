"use client";

import React from "react";
import { Menu } from "lucide-react";
import type { RoleName } from "@/lib/auth/rbac";
import { AdminAccountMenu } from "./admin-account-menu";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

interface AdminHeaderProps {
  onOpenMobileNav: () => void;
  pageTitle?: string;
  isMobileNavOpen?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  theme: AdminTheme;
  onToggleTheme: () => void;
  email?: string | null;
  roles?: readonly RoleName[];
}

export function AdminHeader({
  onOpenMobileNav,
  pageTitle = "Inicio",
  isMobileNavOpen = false,
  triggerRef,
  theme,
  onToggleTheme,
  email = null,
  roles = [],
}: AdminHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          ref={triggerRef}
          type="button"
          onClick={onOpenMobileNav}
          className={styles.menuButton}
          aria-label="Abrir menú de navegación"
          aria-expanded={isMobileNavOpen ? "true" : "false"}
          aria-controls="admin-mobile-nav"
        >
          <Menu className={styles.navIcon} aria-hidden="true" />
        </button>

        <nav aria-label="Ruta de navegación" className={styles.breadcrumbs}>
          <span className={styles.breadcrumbRoot}>Administración</span>
          <span className={styles.breadcrumbRoot} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{pageTitle}</span>
        </nav>
      </div>

      <div className={styles.headerRight}>
        <AdminAccountMenu email={email} roles={roles} theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    </header>
  );
}
