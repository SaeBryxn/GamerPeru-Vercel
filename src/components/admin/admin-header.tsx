"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, Menu } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { AdminThemeToggle } from "./admin-theme-toggle";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

interface AdminHeaderProps {
  onOpenMobileNav: () => void;
  pageTitle?: string;
  isMobileNavOpen?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  theme: AdminTheme;
  onToggleTheme: () => void;
}

export function AdminHeader({
  onOpenMobileNav,
  pageTitle = "Inicio",
  isMobileNavOpen = false,
  triggerRef,
  theme,
  onToggleTheme,
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
        <AdminThemeToggle theme={theme} onToggle={onToggleTheme} />
        <Link
          href="/"
          className={styles.storefrontLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ir a la tienda"
        >
          <span>Ir a la tienda</span>
          <ExternalLink className={styles.navIcon} aria-hidden="true" />
        </Link>
        <LogoutButton appearance="ghost" />
      </div>
    </header>
  );
}
