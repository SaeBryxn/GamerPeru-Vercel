"use client";

import React, { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { getAdminNavigation } from "@/lib/admin/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { AdminMobileNav } from "./admin-mobile-nav";
import styles from "./admin-shell.module.css";

interface AdminShellProps {
  authContext: VerifiedAuthContextReady;
  children: React.ReactNode;
}

export function AdminShell({ authContext, children }: AdminShellProps) {
  const currentPath = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const staff = {
    authUserId: authContext.authUserId,
    email: authContext.email,
    roles: authContext.roles,
    permissions: authContext.permissions,
  };

  const navItems = getAdminNavigation(authContext.permissions);

  return (
    <div className={styles.shell}>
      <a href="#admin-main-content" className={styles.skipLink}>
        Saltar al contenido principal
      </a>

      <AdminHeader
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
        isMobileNavOpen={isMobileNavOpen}
        triggerRef={menuButtonRef}
      />

      <div className={styles.layoutContainer}>
        <AdminSidebar navItems={navItems} staff={staff} currentPath={currentPath} />

        <div className={styles.mainWrapper}>
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
  );
}
