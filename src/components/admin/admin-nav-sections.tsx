"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Cpu,
  FolderTree,
  Gauge,
  KeyRound,
  LayoutTemplate,
  Mouse,
  Palette,
  PanelTop,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  UserCog,
} from "lucide-react";
import { groupAdminNavigation } from "@/lib/admin/navigation";
import type {
  AdminNavFolder,
  AdminNavFolderId,
  AdminNavGroupId,
  AdminNavItem,
} from "@/lib/admin/types";
import styles from "./admin-shell.module.css";

const ICONS: Record<AdminNavItem["iconName"] | AdminNavFolder["iconName"], typeof Gauge> = {
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
  Palette,
  Cpu,
};

const GROUP_TONE: Record<AdminNavGroupId, string | undefined> = {
  operations: styles.toneGreen,
  catalog: styles.toneBlue,
  storefront: styles.toneAmber,
  system: styles.toneViolet,
};

const OPEN_FOLDERS_KEY = "gp-admin-nav-open";

/** Longest matching nav href wins, so nested screens keep their parent active. */
export function resolveActiveNavId(navItems: AdminNavItem[], currentPath: string): string | null {
  const matches = navItems.filter(
    (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).id;
}

function readOpenFolders(): AdminNavFolderId[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OPEN_FOLDERS_KEY) ?? "[]");
    return Array.isArray(value) ? (value as AdminNavFolderId[]) : [];
  } catch {
    return [];
  }
}

function writeOpenFolders(ids: AdminNavFolderId[]) {
  try {
    window.localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(ids));
  } catch {
    // The menu still works; it only forgets which folders were open.
  }
}

interface AdminNavSectionsProps {
  navItems: AdminNavItem[];
  currentPath: string;
  /** Shared-layout id for the active marker; each nav keeps its own so they never swap. */
  markerId: string;
  onNavigate?: () => void;
}

/**
 * The admin destinations split into colored sections. Related destinations sit in a folder
 * that expands in place; the folder holding the current screen is always open.
 */
export function AdminNavSections({
  navItems,
  currentPath,
  markerId,
  onNavigate,
}: AdminNavSectionsProps) {
  const activeId = resolveActiveNavId(navItems, currentPath);
  const activeFolder = navItems.find((item) => item.id === activeId)?.folder;
  const [openFolders, setOpenFolders] = useState<AdminNavFolderId[]>([]);

  // Read after hydration so the server and first client render agree.
  useEffect(() => {
    setOpenFolders(readOpenFolders());
  }, []);

  const toggleFolder = (id: AdminNavFolderId) => {
    setOpenFolders((current) => {
      const next = current.includes(id) ? current.filter((open) => open !== id) : [...current, id];
      writeOpenFolders(next);
      return next;
    });
  };

  const renderLink = (item: AdminNavItem, nested = false) => {
    const isActive = item.id === activeId;
    const Icon = ICONS[item.iconName];
    return (
      <li key={item.id} className={styles.navItem}>
        <Link
          href={item.href}
          onClick={onNavigate}
          title={item.description}
          className={[
            styles.navLink,
            nested ? styles.navLinkNested : "",
            isActive ? styles.navLinkActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
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
  };

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
            {group.entries.map((entry) => {
              if (entry.kind === "item") return renderLink(entry.item);
              const { folder, items } = entry;
              const isOpen = folder.id === activeFolder || openFolders.includes(folder.id);
              const panelId = `${markerId}-${folder.id}`;
              const FolderIcon = ICONS[folder.iconName];
              return (
                <li key={folder.id} className={styles.navItem}>
                  <button
                    type="button"
                    className={`${styles.navLink} ${styles.navFolderButton}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    // The folder with the current screen stays open; closing it would hide it.
                    aria-disabled={folder.id === activeFolder || undefined}
                    onClick={() => {
                      if (folder.id !== activeFolder) toggleFolder(folder.id);
                    }}
                  >
                    <span className={styles.navIconChip} aria-hidden="true">
                      <FolderIcon className={styles.navIcon} />
                    </span>
                    <span className={styles.navLabel}>{folder.label}</span>
                    <ChevronDown
                      className={`${styles.navChevron} ${isOpen ? styles.navChevronOpen : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <ul id={panelId} className={styles.navSubList} hidden={!isOpen}>
                    {items.map((item) => renderLink(item, true))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
