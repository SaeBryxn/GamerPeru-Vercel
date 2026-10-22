"use client";

import React, { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { getAdminNavigation } from "@/lib/admin/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { resolveActiveNavId } from "./admin-nav-sections";
import { AdminHeader } from "./admin-header";
import { AdminMobileNav } from "./admin-mobile-nav";
import { useAdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

interface AdminShellProps {
  authContext: VerifiedAuthContextReady;
  children: React.ReactNode;
}

export function AdminShell({ authContext, children }: AdminShellProps) {
  const currentPath = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const { theme, toggle } = useAdminTheme();

  const staff = {
    authUserId: authContext.authUserId,
    email: authContext.email,
    roles: authContext.roles,
    permissions: authContext.permissions,
  };

  const navItems = getAdminNavigation(authContext.permissions);
  // The breadcrumb names the section the current screen belongs to.
  const activeId = resolveActiveNavId(navItems, currentPath);
  const pageTitle = navItems.find((item) => item.id === activeId)?.label ?? "Inicio";

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.shell}>
        <a href="#admin-main-content" className={styles.skipLink}>
          Saltar al contenido principal
        </a>

        <div className={styles.layoutContainer}>
          <AdminSidebar navItems={navItems} staff={staff} currentPath={currentPath} />

          <div className={styles.mainWrapper}>
            <AdminHeader
              onOpenMobileNav={() => setIsMobileNavOpen(true)}
              isMobileNavOpen={isMobileNavOpen}
              triggerRef={menuButtonRef}
              pageTitle={pageTitle}
              theme={theme}
              onToggleTheme={toggle}
            />

            {/*
              Screen transitions live in app/admin/(protected)/template.tsx. Keying a wrapper
              here by pathname remounted the router's own segment tree on every navigation,
              which could leave the new screen blank until a full reload.
            */}
            <main id="admin-main-content" className={styles.mainContent} tabIndex={-1}>
              {children}
            </main>
          </div>
        </div>

        <AdminMobileNav
          isOpen={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          navItems={navItems}
          staff={staff}
          currentPath={currentPath}
          triggerRef={menuButtonRef}
        />
      </div>
    </MotionConfig>
  );
}
