"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, m, type Variants } from "framer-motion";
import { Container, FloatingClose, MagneticWrapper, useFloatingClose } from "@/components/ui";
import type { MegaMenuCategory, MegaMenuShelves, NavLink } from "../types";
import { MegaMenuGrid } from "./mega-menu-grid";
import { MegaMenuLinks } from "./mega-menu-links";
import { MegaMenuProducts } from "./mega-menu-products";
import { MegaMenuSeries } from "./mega-menu-series";
import styles from "./desktop-nav.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
const PANEL_ROUNDING = "round 0px 0px 12px 12px";

/*
 * Panels stay mounted (their links remain in the server HTML for crawlers), so
 * presence is handled with variants: "open" reveals top-down like an accordion,
 * "closed" folds back up a little slower and only then drops to display:none.
 * Switching menus runs one panel's close and the other's open at the same time,
 * which reads as a single morph rather than a cut. clipPath is released after
 * opening so the drop shadow is not clipped.
 */
const PANEL_VARIANTS: Variants = {
  open: {
    display: "block",
    opacity: 1,
    clipPath: `inset(0% 0% 0% 0% ${PANEL_ROUNDING})`,
    transition: {
      opacity: { duration: 0.3, ease: "easeOut" },
      clipPath: { duration: 0.55, ease: EASE_OUT_EXPO },
    },
    transitionEnd: { clipPath: "none" },
  },
  closed: {
    opacity: 0,
    clipPath: `inset(0% 0% 100% 0% ${PANEL_ROUNDING})`,
    transition: {
      opacity: { duration: 0.4, ease: "easeInOut" },
      clipPath: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
    },
    transitionEnd: { display: "none" },
  },
};

export interface DesktopNavProps {
  items: MegaMenuCategory[];
  productTypes?: NavLink[];
  /** Live product shelves resolved on the server; absent when nothing is published. */
  shelves?: MegaMenuShelves;
  className?: string;
}

const UNDERLINE_TRANSITION = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;

export function DesktopNav({ items, productTypes = [], shelves, className }: DesktopNavProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pathname = usePathname() ?? "";
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const floatingClose = useFloatingClose();

  const closeMenu = () => setActiveCategoryId(null);

  // Close mega-menu on Escape key and return focus to the active trigger
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && activeCategoryId) {
        e.preventDefault();
        const trigger = triggerRefs.current.get(activeCategoryId);
        setActiveCategoryId(null);
        trigger?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCategoryId]);

  // Close mega-menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveCategoryId(null);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // One underline travels between items: the hovered one, else the open menu, else the current page.
  const routeActiveId =
    items.find(
      (category) =>
        category.href !== "/" &&
        (pathname === category.href || pathname.startsWith(`${category.href}/`))
    )?.id ?? null;
  const underlineId = hoveredId ?? activeCategoryId ?? routeActiveId;

  const underline = (
    <m.span
      layoutId="desktop-nav-underline"
      className={styles.underline}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={UNDERLINE_TRANSITION}
      aria-hidden="true"
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <nav
        ref={navRef}
        className={[styles.desktopNav, className].filter(Boolean).join(" ")}
        aria-label="Navegación principal"
      >
        <ul className={styles.navList} onPointerLeave={() => setHoveredId(null)}>
          {items.map((category) => {
            if (!category.menuLayout) {
              return (
                <li key={category.id} className={styles.navItem}>
                  <Link
                    href={category.href}
                    className={styles.categoryTrigger}
                    onPointerEnter={() => setHoveredId(category.id)}
                    onFocus={() => setHoveredId(category.id)}
                    onBlur={() => setHoveredId(null)}
                  >
                    <MagneticWrapper>{category.label}</MagneticWrapper>
                    <AnimatePresence>{underlineId === category.id && underline}</AnimatePresence>
                  </Link>
                </li>
              );
            }

            const isExpanded = activeCategoryId === category.id;
            const panelId = `mega-menu-${category.id}`;

            return (
              <li key={category.id} className={styles.navItem}>
                <button
                  ref={(el) => {
                    if (el) triggerRefs.current.set(category.id, el);
                    else triggerRefs.current.delete(category.id);
                  }}
                  type="button"
                  className={[
                    styles.categoryTrigger,
                    isExpanded ? styles.categoryTriggerActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onPointerEnter={() => setHoveredId(category.id)}
                  onFocus={() => setHoveredId(category.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveCategoryId(isExpanded ? null : category.id);
                  }}
                >
                  <MagneticWrapper>{category.label}</MagneticWrapper>
                  <AnimatePresence>{underlineId === category.id && underline}</AnimatePresence>
                </button>

                <m.div
                  id={panelId}
                  className={styles.megaMenuPanel}
                  role="region"
                  aria-label={`Menú desplegable ${category.label}`}
                  variants={PANEL_VARIANTS}
                  initial={false}
                  animate={isExpanded ? "open" : "closed"}
                >
                  <Container size="full">
                    {category.menuLayout === "series" ? (
                      <MegaMenuSeries
                        category={category}
                        isOpen={isExpanded}
                        onNavigate={closeMenu}
                      />
                    ) : category.menuLayout === "grid" ? (
                      <MegaMenuGrid
                        category={category}
                        isOpen={isExpanded}
                        onNavigate={closeMenu}
                      />
                    ) : category.menuLayout === "links" ? (
                      <MegaMenuLinks
                        category={category}
                        isOpen={isExpanded}
                        onNavigate={closeMenu}
                      />
                    ) : (
                      <MegaMenuProducts
                        category={category}
                        collections={productTypes}
                        shelves={shelves}
                        isOpen={isExpanded}
                        onNavigate={closeMenu}
                      />
                    )}
                  </Container>
                </m.div>
              </li>
            );
          })}
        </ul>

        {/* One backdrop shared by every panel, so switching menus never flickers it. */}
        <AnimatePresence>
          {activeCategoryId && (
            <m.div
              key="mega-menu-backdrop"
              {...floatingClose.targetProps}
              className={`${styles.megaMenuBackdrop} ${floatingClose.targetProps.className}`}
              aria-hidden="true"
              onClick={closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.35, ease: "easeOut" } }}
              exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeInOut" } }}
            />
          )}
        </AnimatePresence>
        <FloatingClose
          state={floatingClose}
          active={activeCategoryId !== null}
          portal
          data-testid="mega-menu-floating-close"
        />
      </nav>
    </MotionConfig>
  );
}
