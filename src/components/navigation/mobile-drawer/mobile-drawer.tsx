"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { ArrowRight, ChevronDown, HelpCircle, User, X } from "lucide-react";
import { Icon, IconButton } from "@/components/ui";
import { BrandMark } from "../brand-mark";
import type { MegaMenuCategory, MegaMenuSection } from "../types";
import styles from "./mobile-drawer.module.css";

const PANEL_TRANSITION: Transition = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 };
const ACCORDION_TRANSITION: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: MegaMenuCategory[];
  accountHref?: string;
  supportHref?: string;
}

/** Link groups of a category: its series first (the models), then its browse-by sections. */
function categoryGroups(category: MegaMenuCategory): MegaMenuSection[] {
  return [...(category.series ?? []), ...category.sections].filter(
    (group) => group.items.length > 0
  );
}

/**
 * Side drawer for narrow screens. It is a native modal dialog (focus containment, Escape and the
 * inert background come from the platform) whose panel is animated by Framer Motion; the dialog
 * only closes once the panel has finished leaving, so focus can return to the opener.
 */
export function MobileDrawer({
  isOpen,
  onClose,
  items,
  accountHref = "/cuenta",
  supportHref = "/ayuda",
}: MobileDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const requestClose = useCallback(() => setIsVisible(false), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleExitComplete = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setExpandedId(null);
    onClose();
  };

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    event.preventDefault();
    requestClose();
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) requestClose();
  };

  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION;
  const accordionTransition = prefersReducedMotion ? { duration: 0 } : ACCORDION_TRANSITION;

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, isVisible ? styles.open : ""].filter(Boolean).join(" ")}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label="Menú de navegación móvil"
    >
      <AnimatePresence onExitComplete={handleExitComplete}>
        {isVisible && (
          <motion.div
            key="drawer-panel"
            className={styles.drawerPanel}
            role="document"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={panelTransition}
          >
            <div className={styles.drawerHeader}>
              <BrandMark onClick={requestClose} />
              <IconButton
                icon={X}
                iconSize="md"
                variant="ghost"
                aria-label="Cerrar navegación"
                onClick={requestClose}
              />
            </div>

            <nav className={styles.drawerContent} aria-label="Categorías principales">
              {items.map((category) => {
                const isExpanded = expandedId === category.id;
                const sectionId = `drawer-cat-${category.id}`;

                return (
                  <div key={category.id} className={styles.categoryGroup}>
                    <button
                      type="button"
                      className={styles.groupSummary}
                      aria-expanded={isExpanded}
                      aria-controls={sectionId}
                      onClick={() => setExpandedId(isExpanded ? null : category.id)}
                    >
                      <span>{category.label}</span>
                      <motion.span
                        className={styles.groupChevron}
                        initial={false}
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={accordionTransition}
                      >
                        <Icon icon={ChevronDown} size="sm" aria-hidden="true" />
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          id={sectionId}
                          className={styles.accordion}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={accordionTransition}
                        >
                          <div className={styles.accordionInner}>
                            <Link
                              href={category.href}
                              className={styles.viewAll}
                              onClick={requestClose}
                            >
                              <span>Ver todo en {category.label}</span>
                              <Icon icon={ArrowRight} size="sm" aria-hidden="true" />
                            </Link>

                            {categoryGroups(category).map((group) => (
                              <div key={group.title} className={styles.linkGroup}>
                                <p className={styles.linkGroupTitle}>{group.title}</p>
                                <ul className={styles.subList}>
                                  {group.items.map((item) => (
                                    <li key={item.href + item.label}>
                                      <Link
                                        href={item.href}
                                        className={styles.subLink}
                                        onClick={requestClose}
                                      >
                                        {item.label}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>

            <div className={styles.drawerFooter}>
              <div className={styles.footerRow}>
                <Link href={accountHref} className={styles.footerLink} onClick={requestClose}>
                  <Icon icon={User} size="md" aria-hidden="true" />
                  <span>Mi cuenta</span>
                </Link>
                <span className={styles.currencyBadge} aria-label="Moneda: Soles Peruanos">
                  PEN (S/)
                </span>
              </div>

              <div className={styles.footerRow}>
                <Link href={supportHref} className={styles.footerLink} onClick={requestClose}>
                  <Icon icon={HelpCircle} size="md" aria-hidden="true" />
                  <span>Centro de ayuda</span>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
