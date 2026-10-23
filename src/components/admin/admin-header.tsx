"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import type { RoleName } from "@/lib/auth/rbac";
import type { AdminIdentity } from "@/lib/admin/staff/identity";
import { AdminAccountMenu } from "./admin-account-menu";
import type { AdminCrumb } from "./admin-breadcrumbs";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

interface AdminHeaderProps {
  onOpenMobileNav: () => void;
  crumbs?: AdminCrumb[];
  isMobileNavOpen?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  theme: AdminTheme;
  onToggleTheme: () => void;
  identity?: AdminIdentity;
  roles?: readonly RoleName[];
}

export function AdminHeader({
  onOpenMobileNav,
  crumbs = [{ label: "Inicio", href: null }],
  isMobileNavOpen = false,
  triggerRef,
  theme,
  onToggleTheme,
  identity,
  roles = [],
}: AdminHeaderProps) {
  // On a phone only the current screen fits; a back arrow keeps the level above one tap away.
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
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

      <div className={styles.headerRight}>
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
