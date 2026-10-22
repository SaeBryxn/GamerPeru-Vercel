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
import type { AdminNavFolder, AdminNavFolderId, AdminNavItem } from "@/lib/admin/types";
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

const OPEN_FOLDERS_KEY = "gp-admin-nav-open";

/** Longest matching nav href wins, so nested screens keep their parent active. */
export function resolveActiveNavId(navItems: AdminNavItem[], currentPath: string): string | null {
  const matches = navItems.filter(
    (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).id;
}

/** Folders the operator opened or closed by hand; the rest follow the current screen. */
type FolderChoices = Partial<Record<AdminNavFolderId, boolean>>;

function readFolderChoices(): FolderChoices {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OPEN_FOLDERS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeFolderChoices(choices: FolderChoices) {
  try {
    window.localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(choices));
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
  /** Icon rail: every destination as an icon, names in tooltips and for screen readers. */
  collapsed?: boolean;
}

/**
 * The admin destinations split into sections. Related destinations sit in a folder that expands
 * in place; the folder holding the current screen starts open, and any folder can be opened or
 * closed by hand. Collapsed, the sections become a flat column of icons separated by hairlines.
 */
export function AdminNavSections({
  navItems,
  currentPath,
  markerId,
  onNavigate,
  collapsed = false,
}: AdminNavSectionsProps) {
  const activeId = resolveActiveNavId(navItems, currentPath);
  const activeFolder = navItems.find((item) => item.id === activeId)?.folder;
  const [folderChoices, setFolderChoices] = useState<FolderChoices>({});

  // Read after hydration so the server and first client render agree.
  useEffect(() => {
    setFolderChoices(readFolderChoices());
  }, []);

  const isFolderOpen = (id: AdminNavFolderId) => folderChoices[id] ?? id === activeFolder;

  const toggleFolder = (id: AdminNavFolderId) => {
    setFolderChoices((current) => {
      const next = { ...current, [id]: !(current[id] ?? id === activeFolder) };
      writeFolderChoices(next);
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
          title={collapsed ? item.label : item.description}
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
          <span className={collapsed ? styles.visuallyHidden : styles.navLabel}>{item.label}</span>
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
            {group.entries
              .flatMap((entry) => (entry.kind === "item" ? [entry.item] : entry.items))
              .map((item) => renderLink(item))}
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
          <div className={styles.navGroupHead}>
            <h2 id={`${markerId}-${group.id}`} className={styles.navSectionTitle}>
              {group.label}
            </h2>
          </div>
          <ul className={styles.navList}>
            {group.entries.map((entry) => {
              if (entry.kind === "item") return renderLink(entry.item);
              const { folder, items } = entry;
              const isOpen = isFolderOpen(folder.id);
              const panelId = `${markerId}-${folder.id}`;
              const FolderIcon = ICONS[folder.iconName];
              return (
                <li key={folder.id} className={styles.navItem}>
                  <button
                    type="button"
                    className={`${styles.navLink} ${styles.navFolderButton}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleFolder(folder.id)}
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
