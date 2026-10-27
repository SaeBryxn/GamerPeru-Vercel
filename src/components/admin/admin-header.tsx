"use client";

import React from "react";
import Link from "@/components/app-link";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import type { RoleName } from "@/lib/auth/rbac";
import type { AdminIdentity } from "@/lib/admin/staff/identity";
import { AdminAccountMenu } from "./admin-account-menu";
import type { AdminCrumb } from "./admin-breadcrumbs";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

interface AdminHeaderProps {
  onOpenMobileNav: () => void;
  isMobileNavOpen?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  theme: AdminTheme;
  onToggleTheme: () => void;
  identity?: AdminIdentity;
  roles?: readonly RoleName[];
  /** The global search field, on the left. */
  search?: React.ReactNode;
  /** The notifications bell, before the account menu. */
  notifications?: React.ReactNode;
}

/** Global top bar: the same on every admin screen. Screen titles live in each PageHeader. */
export function AdminHeader({
  onOpenMobileNav,
  isMobileNavOpen = false,
  triggerRef,
  theme,
  onToggleTheme,
  identity,
  roles = [],
  search,
  notifications,
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
        {search}
      </div>

      <div className={styles.headerRight}>
        {notifications}
        <AdminAccountMenu
          email={identity?.email ?? null}
          displayName={identity?.displayName}
          avatarUrl={identity?.avatarUrl}
          roles={roles}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
      </div>
    </header>
  );
}

/**
 * Inicio › section › sub-screen above the content, every level but the current one a link back.
 * Inicio alone needs no trail. On a phone only a back arrow and the current screen fit.
 */
export function AdminBreadcrumbs({ crumbs }: { crumbs: AdminCrumb[] }) {
  if (crumbs.length < 2) return null;
  const parent = crumbs[crumbs.length - 2];
  return (
    <div className={styles.crumbBar}>
      {parent?.href && (
        <Link
          href={parent.href}
          className={styles.crumbBack}
          aria-label={`Volver a ${parent.label}`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
      )}
      <nav aria-label="Ruta de navegación" className={styles.breadcrumbs}>
        <ol className={styles.crumbList}>
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className={styles.crumb}>
              {index > 0 && (
                <ChevronRight className={styles.crumbSeparator} size={14} aria-hidden="true" />
              )}
              {crumb.href ? (
                <Link href={crumb.href} className={styles.crumbLink}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
