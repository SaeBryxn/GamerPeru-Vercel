"use client";

import React from "react";
import Link from "@/components/app-link";
import { m } from "framer-motion";
import {
  Boxes,
  ClipboardList,
  Cpu,
  CreditCard,
  FolderTree,
  House,
  LayoutTemplate,
  MessageSquareText,
  Package,
  PanelTop,
  Sparkles,
  Users,
} from "lucide-react";
import { groupAdminNavigation } from "@/lib/admin/navigation";
import type { AdminNavBadgeKey, AdminNavItem } from "@/lib/admin/types";
import styles from "./admin-shell.module.css";

const ICONS: Record<AdminNavItem["iconName"], typeof House> = {
  House,
  ClipboardList,
  CreditCard,
  Boxes,
  Package,
  Sparkles,
  MessageSquareText,
  FolderTree,
  LayoutTemplate,
  PanelTop,
  Users,
  Cpu,
};

export type AdminNavBadges = Partial<Record<AdminNavBadgeKey, number>>;

/** Longest matching nav href wins, so nested screens keep their parent active. */
export function resolveActiveNavId(navItems: AdminNavItem[], currentPath: string): string | null {
  const matches = navItems.filter(
    (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).id;
}

interface AdminNavSectionsProps {
  navItems: AdminNavItem[];
  currentPath: string;
  /** Shared-layout id for the active marker; each nav keeps its own so they never swap. */
  markerId: string;
  onNavigate?: () => void;
  /** Icon rail: every destination as an icon, names in tooltips and for screen readers. */
  collapsed?: boolean;
  /** Pending work per destination; zero or missing shows nothing. */
  badges?: AdminNavBadges;
}

/**
 * The admin destinations split into labelled sections. Collapsed, the sections become a flat
 * column of icons separated by hairlines, and a pending count shrinks to a dot.
 */
export function AdminNavSections({
  navItems,
  currentPath,
  markerId,
  onNavigate,
  collapsed = false,
  badges = {},
}: AdminNavSectionsProps) {
  const activeId = resolveActiveNavId(navItems, currentPath);

  const renderLink = (item: AdminNavItem) => {
    const isActive = item.id === activeId;
    const Icon = ICONS[item.iconName];
    const count = item.badge ? (badges[item.badge] ?? 0) : 0;
    const countLabel = count > 99 ? "99+" : String(count);
    return (
      <li key={item.id} className={styles.navItem}>
        <Link
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : item.description}
          className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
          aria-current={isActive ? "page" : undefined}
        >
          {/* One shared marker glides between entries: a tween, never a bounce. */}
          {isActive && (
            <m.span
              layoutId={markerId}
              className={styles.navActiveMarker}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              aria-hidden="true"
            />
          )}
          <span className={styles.navIconChip} aria-hidden="true">
            <Icon className={styles.navIcon} />
          </span>
          <span className={collapsed ? styles.visuallyHidden : styles.navLabel}>{item.label}</span>
          {count > 0 && (
            <span
              className={`${styles.navBadge} ${item.badge === "outOfStock" ? styles.navBadgeWarning : ""}`}
              data-collapsed={collapsed || undefined}
            >
              <span aria-hidden="true">{collapsed ? "" : countLabel}</span>
              <span className={styles.visuallyHidden}>{`, ${count} pendientes`}</span>
            </span>
          )}
        </Link>
      </li>
    );
  };

  const groups = groupAdminNavigation(navItems);

  if (collapsed) {
    return (
      <div className={styles.navRail}>
        {groups.map((group) => (
          <ul key={group.id} className={styles.navList} aria-label={group.label}>
            {group.items.map(renderLink)}
          </ul>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.navGroups}>
      {groups.map((group) => (
        <section
          key={group.id}
          className={styles.navGroup}
          aria-labelledby={`${markerId}-${group.id}`}
        >
          <h2 id={`${markerId}-${group.id}`} className={styles.navSectionTitle}>
            {group.label}
          </h2>
          <ul className={styles.navList}>{group.items.map(renderLink)}</ul>
        </section>
      ))}
    </div>
  );
}
