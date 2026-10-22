"use client";

import React from "react";
import Link from "next/link";
import type { AdminNavItem, AdminStaffProfile } from "@/lib/admin/types";
import { AdminNavSections } from "./admin-nav-sections";
import styles from "./admin-shell.module.css";

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  staff: AdminStaffProfile;
  currentPath?: string;
}

export function AdminSidebar({ navItems, staff, currentPath = "/admin" }: AdminSidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Navegación administrativa">
      <div className={styles.sidebarTop}>
        <Link href="/admin" className={styles.sidebarBrand}>
          <span className={styles.brandLogo}>Gamer Perú</span>
          <span className={styles.brandBadge}>ADMIN</span>
        </Link>

        <nav aria-label="Secciones del panel" className={styles.sidebarNav}>
          <AdminNavSections
            navItems={navItems}
            currentPath={currentPath}
            markerId="admin-nav-active"
          />
        </nav>
      </div>

      <div className={styles.staffProfileCard}>
        <span className={styles.staffAvatar} aria-hidden="true">
          {(staff.email ?? "A").slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.staffDetails}>
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
