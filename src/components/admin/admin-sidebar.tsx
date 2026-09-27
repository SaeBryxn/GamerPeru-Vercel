"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bot,
  CheckCircle,
  LayoutDashboard,
  Menu,
  Package,
  Settings2,
  ShoppingCart,
  Tags,
} from "lucide-react";
import type { AdminNavItem, AdminStaffProfile } from "@/lib/admin/types";
import styles from "./admin-shell.module.css";

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  staff: AdminStaffProfile;
  currentPath?: string;
}

const ICONS = {
  LayoutDashboard,
  ShoppingCart,
  CheckCircle,
  Package,
  Bot,
  Settings2,
  Tags,
  Menu,
};

/** Longest matching nav href wins, so nested screens keep their parent active. */
export function resolveActiveNavId(navItems: AdminNavItem[], currentPath: string): string | null {
  const matches = navItems.filter(
    (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).id;
}

export function AdminSidebar({ navItems, staff, currentPath = "/admin" }: AdminSidebarProps) {
  const activeId = resolveActiveNavId(navItems, currentPath);

  return (
    <aside className={styles.sidebar} aria-label="Navegación administrativa">
      <div className={styles.sidebarTop}>
        <Link href="/admin" className={styles.sidebarBrand}>
          <span className={styles.brandLogo}>Gamer Perú</span>
          <span className={styles.brandBadge}>ADMIN</span>
        </Link>

        <div className={styles.navSectionTitle}>Principal</div>
        <nav aria-label="Secciones del panel">
          <ul className={styles.navList}>
            {navItems.map((item) => {
              const isActive = item.id === activeId;
              const IconComponent = ICONS[item.iconName as keyof typeof ICONS] ?? LayoutDashboard;
              return (
                <li key={item.id} className={styles.navItem}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {/* One shared marker glides between entries: a tween, never a bounce. */}
                    {isActive && (
                      <motion.span
                        layoutId="admin-nav-active"
                        className={styles.navActiveMarker}
                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        aria-hidden="true"
                      />
                    )}
                    <IconComponent className={styles.navIcon} aria-hidden="true" />
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
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
