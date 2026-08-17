"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, HelpCircle, User, X } from "lucide-react";
import { Icon, IconButton } from "@/components/ui";
import { BrandMark } from "../brand-mark";
import type { MegaMenuCategory } from "../types";
import styles from "./mobile-drawer.module.css";

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: MegaMenuCategory[];
  accountHref?: string;
  supportHref?: string;
}

export function MobileDrawer({
  isOpen,
  onClose,
  items,
  accountHref = "/cuenta",
  supportHref = "/ayuda",
}: MobileDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const handleClose = useCallback(() => {
    setIsTransitioning(false);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = prefersReducedMotion ? 0 : 350;

    const timeout = setTimeout(() => {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
      onClose();
    }, delay);

    return () => clearTimeout(timeout);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      // Trigger CSS open transition on next frame
      requestAnimationFrame(() => {
        setIsTransitioning(true);
      });
    } else if (dialog.open) {
      handleClose();
    }
  }, [isOpen, handleClose]);

  // Handle native escape key
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    handleClose();
  };

  // Handle click on backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleClose();
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, isTransitioning ? styles.open : ""].filter(Boolean).join(" ")}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label="Menú de navegación móvil"
    >
      <div className={styles.drawerPanel} role="document">
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <BrandMark onClick={handleClose} />
          <IconButton
            icon={X}
            iconSize="md"
            variant="ghost"
            aria-label="Cerrar navegación"
            onClick={handleClose}
          />
        </div>

        {/* Drawer Scrollable Navigation */}
        <nav className={styles.drawerContent} aria-label="Categorías principales">
          {items.map((category) => {
            const isExpanded = Boolean(expandedSections[category.id]);
            const sectionId = `drawer-cat-${category.id}`;

            return (
              <div key={category.id} className={styles.categoryGroup}>
                <button
                  type="button"
                  className={styles.groupSummary}
                  aria-expanded={isExpanded}
                  aria-controls={sectionId}
                  onClick={() => toggleSection(category.id)}
                >
                  <span>{category.label}</span>
                  <span className={styles.groupChevron}>
                    <Icon icon={ChevronDown} size="sm" aria-hidden="true" />
                  </span>
                </button>

                {isExpanded && (
                  <ul id={sectionId} className={styles.subList}>
                    <li>
                      <Link
                        href={category.href}
                        className={styles.subLink}
                        style={{ fontWeight: 600, color: "var(--color-brand-primary)" }}
                        onClick={handleClose}
                      >
                        Ver todo en {category.label} →
                      </Link>
                    </li>
                    {category.sections.flatMap((section) =>
                      section.items.map((item, idx) => (
                        <li key={idx}>
                          <Link href={item.href} className={styles.subLink} onClick={handleClose}>
                            {item.label}
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* Drawer Pinned Footer */}
        <div className={styles.drawerFooter}>
          <div className={styles.footerRow}>
            <Link href={accountHref} className={styles.footerLink} onClick={handleClose}>
              <Icon icon={User} size="md" aria-hidden="true" />
              <span>Mi cuenta</span>
            </Link>
            <span className={styles.currencyBadge} aria-label="Moneda: Soles Peruanos">
              PEN (S/)
            </span>
          </div>

          <div className={styles.footerRow}>
            <Link href={supportHref} className={styles.footerLink} onClick={handleClose}>
              <Icon icon={HelpCircle} size="md" aria-hidden="true" />
              <span>Centro de ayuda</span>
            </Link>
          </div>
        </div>
      </div>
    </dialog>
  );
}
