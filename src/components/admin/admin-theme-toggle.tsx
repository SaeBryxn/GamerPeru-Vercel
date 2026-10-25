"use client";

import React from "react";
import { AnimatePresence, m } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-shell.module.css";

const SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

export interface AdminThemeToggleProps {
  theme: AdminTheme;
  onToggle: () => void;
}

/** Sun/moon switch: the outgoing icon rotates away as the next one arrives. */
export function AdminThemeToggle({ theme, onToggle }: AdminThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <m.button
      type="button"
      onClick={onToggle}
      className={styles.themeToggle}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-pressed={isDark}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
      data-testid="admin-theme-toggle"
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={theme}
          className={styles.themeToggleIcon}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {isDark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </m.span>
      </AnimatePresence>
    </m.button>
  );
}
