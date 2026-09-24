"use client";

import { useCallback, useEffect, useState } from "react";

export type AdminTheme = "light" | "dark";

export const ADMIN_THEME_STORAGE_KEY = "gp-admin-theme";
export const ADMIN_THEME_ATTRIBUTE = "data-admin-theme";

/**
 * Applied before paint by the inline script in the admin layout, so the shell
 * never flashes the wrong theme. Kept as a string because it is injected raw.
 */
export const ADMIN_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  ADMIN_THEME_STORAGE_KEY
)});var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute(${JSON.stringify(
  ADMIN_THEME_ATTRIBUTE
)},t);}catch(e){}})();`;

function readStoredTheme(): AdminTheme | null {
  try {
    const stored = localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): AdminTheme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Admin color theme: the operator's choice wins and is remembered; without one
 * the shell follows the operating system and keeps following it live.
 */
export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initial = readStoredTheme() ?? systemTheme();
    setTheme(initial);
    setIsReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme() === null) setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    document.documentElement.setAttribute(ADMIN_THEME_ATTRIBUTE, theme);
    // Leaving the admin (client navigation) must not repaint the storefront.
    return () => document.documentElement.removeAttribute(ADMIN_THEME_ATTRIBUTE);
  }, [theme, isReady]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
      } catch {
        // Private mode or blocked storage: the choice just lasts this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle, isReady };
}
