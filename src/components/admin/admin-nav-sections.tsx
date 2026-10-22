"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FolderTree,
  Gauge,
  KeyRound,
  LayoutTemplate,
  Mouse,
  PanelTop,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  UserCog,
} from "lucide-react";
import { groupAdminNavigation } from "@/lib/admin/navigation";
import type { AdminNavGroupId, AdminNavItem } from "@/lib/admin/types";
import styles from "./admin-shell.module.css";

const ICONS: Record<AdminNavItem["iconName"], typeof Gauge> = {
  Gauge,
  ShoppingBag,
  ReceiptText,
  Mouse,
  FolderTree,
  LayoutTemplate,
  PanelTop,
  Sparkles,
  KeyRound,
  UserCog,
};

const GROUP_TONE: Record<AdminNavGroupId, string | undefined> = {
  overview: styles.toneCrimson,
  sales: styles.toneGreen,
  catalog: styles.toneBlue,
  storefront: styles.toneAmber,
  ai: styles.toneViolet,
  access: styles.toneTeal,
};

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
}

/**
 * The admin destinations split into colored sections, each titled with what is done there.
 * Every section keeps one hue on its icons and on the active marker.
 */
export function AdminNavSections({
  navItems,
  currentPath,
  markerId,
  onNavigate,
}: AdminNavSectionsProps) {
  const activeId = resolveActiveNavId(navItems, currentPath);

  return (
    <div className={styles.navGroups}>
      {groupAdminNavigation(navItems).map((group) => (
        <section
          key={group.id}
          className={`${styles.navGroup} ${GROUP_TONE[group.id] ?? ""}`}
          aria-labelledby={`${markerId}-${group.id}`}
        >
          <div className={styles.navGroupHead}>
            <h2 id={`${markerId}-${group.id}`} className={styles.navSectionTitle}>
              {group.label}
            </h2>
            <p className={styles.navGroupHint}>{group.hint}</p>
          </div>
          <ul className={styles.navList}>
            {group.items.map((item) => {
              const isActive = item.id === activeId;
              const Icon = ICONS[item.iconName];
              return (
                <li key={item.id} className={styles.navItem}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={item.description}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {/* One shared marker glides between entries: a tween, never a bounce. */}
                    {isActive && (
                      <motion.span
                        layoutId={markerId}
                        className={styles.navActiveMarker}
                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        aria-hidden="true"
                      />
                    )}
                    <span className={styles.navIconChip} aria-hidden="true">
                      <Icon className={styles.navIcon} />
                    </span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
