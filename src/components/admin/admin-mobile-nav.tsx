"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { AdminNavItem } from "@/lib/admin/types";
import { AdminNavSections } from "./admin-nav-sections";
import styles from "./admin-shell.module.css";

interface AdminMobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: AdminNavItem[];
  currentPath?: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function AdminMobileNav({
  isOpen,
  onClose,
  navItems,
  currentPath = "/admin",
  triggerRef,
}: AdminMobileNavProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement && lastElement) {
            lastElement.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement && firstElement) {
            firstElement.focus();
            event.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className={styles.drawerBackdrop}
        onClick={() => {
          onClose();
          triggerRef?.current?.focus();
        }}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        id="admin-mobile-nav"
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de administración móvil"
      >
        <div>
          <div className={styles.drawerHeader}>
            <div className={styles.sidebarBrand}>
              <span className={styles.brandLogo}>Gamer Perú</span>
              <span className={styles.brandBadge}>ADMIN</span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => {
                onClose();
                triggerRef?.current?.focus();
              }}
              className={styles.closeButton}
              aria-label="Cerrar menú de navegación"
            >
              <X className={styles.navIcon} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Secciones del panel móvil" className={styles.sidebarNav}>
            <AdminNavSections
              navItems={navItems}
              currentPath={currentPath}
              markerId="admin-mobile-nav-active"
              onNavigate={() => {
                onClose();
                triggerRef?.current?.focus();
              }}
            />
          </nav>
        </div>
      </div>
    </>
  );
}
