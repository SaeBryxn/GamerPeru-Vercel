"use client";

import React, { useId, useRef, useState } from "react";
import { AnimatePresence, m, type Variants } from "framer-motion";
import type { MegaMenuCategory, MegaMenuShelves, NavLink } from "../types";
import { MegaMenuArrowLink } from "./mega-menu-arrow-link";
import {
  RISE_FROM_BELOW,
  SLIDE_FROM_RIGHT,
  staggerVariants,
  useOpenCount,
} from "./mega-menu-motion";
import { ProductCard } from "@/components/catalog/product-card/product-card";
import { SweepUnderline } from "@/components/ui/sweep-underline";
import styles from "./desktop-nav.module.css";

// Left column: heading, then each tab top to bottom, then the footer link.
const SIDE_VARIANTS = staggerVariants(0.09, 0.15);
const TAB_LIST_VARIANTS = staggerVariants(0.08);

const SHELF_VARIANTS: Variants = {
  ...staggerVariants(0.1, 0.2),
  exit: { opacity: 0, transition: { duration: 0.25, ease: "easeIn" } },
};

export interface MegaMenuProductsProps {
  category: MegaMenuCategory;
  /** Replays the staggered entrance of both columns every time the panel opens. */
  isOpen: boolean;
  collections: NavLink[];
  /** Resolved from the catalog on the server; a collection with nothing published has no shelf. */
  shelves?: MegaMenuShelves;
  onNavigate: () => void;
}

export function MegaMenuProducts({
  category,
  collections,
  shelves,
  isOpen,
  onNavigate,
}: MegaMenuProductsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openCount = useOpenCount(isOpen);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      collections.findIndex((collection) => collection.href === category.href),
      0
    )
  );

  const activeCollection = collections[activeIndex];
  const shelf = activeCollection ? shelves?.[activeCollection.href] : undefined;
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  const tabPanelId = `${baseId}-tabpanel`;

  // Vertical tabs with automatic activation (WAI-ARIA APG tabs pattern).
  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const lastIndex = collections.length - 1;
    const nextIndex =
      event.key === "ArrowDown"
        ? activeIndex === lastIndex
          ? 0
          : activeIndex + 1
        : event.key === "ArrowUp"
          ? activeIndex === 0
            ? lastIndex
            : activeIndex - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.productsLayout}>
      <m.div
        key={openCount}
        className={styles.megaSide}
        variants={SIDE_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <m.h2 id={`${baseId}-heading`} className={styles.sideHeading} variants={SLIDE_FROM_RIGHT}>
          Colecciones
        </m.h2>
        <m.div
          variants={TAB_LIST_VARIANTS}
          role="tablist"
          aria-orientation="vertical"
          aria-labelledby={`${baseId}-heading`}
          className={styles.collectionsList}
        >
          {collections.map((collection, index) => {
            const isActive = index === activeIndex;
            return (
              <m.button
                key={collection.href}
                variants={SLIDE_FROM_RIGHT}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={tabPanelId}
                tabIndex={isActive ? 0 : -1}
                className={[styles.collectionsLink, isActive ? styles.collectionsLinkCurrent : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveIndex(index)}
                onKeyDown={handleTabKeyDown}
              >
                <SweepUnderline trigger="link">{collection.label}</SweepUnderline>
              </m.button>
            );
          })}
        </m.div>

        <m.div className={styles.footerRow} variants={SLIDE_FROM_RIGHT}>
          <MegaMenuArrowLink
            href={category.href}
            className={styles.footerRowLink}
            arrowSize="md"
            fullWidth
            onClick={onNavigate}
          >
            Ver todos los productos
          </MegaMenuArrowLink>
        </m.div>
      </m.div>

      <div
        id={tabPanelId}
        role="tabpanel"
        aria-labelledby={tabId(activeIndex)}
        className={styles.megaPreviews}
      >
        {/*
          The wrapper remounts on every open so the entrance replays without the
          previous shelf fading out first; within an open panel, mode="wait"
          fades the old tab out before the new one staggers in (header first,
          then each card rising from below). Content stays put while the panel
          itself animates closed.
        */}
        <div key={openCount}>
          <AnimatePresence mode="wait">
            {activeCollection && (
              <m.div
                key={activeCollection.href}
                variants={SHELF_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <m.div className={styles.previewsHeader} variants={RISE_FROM_BELOW}>
                  <p className={styles.sideEyebrow}>Más populares</p>
                  <MegaMenuArrowLink
                    href={activeCollection.href}
                    className={styles.topRightViewAll}
                    onClick={onNavigate}
                  >
                    Ver todo en {activeCollection.label}
                    {shelf && <span className={styles.viewAllCount}> ({shelf.totalCount})</span>}
                  </MegaMenuArrowLink>
                </m.div>

                {shelf && shelf.products.length > 0 ? (
                  <div className={styles.previewGrid}>
                    {shelf.products.map((product) => (
                      <m.div key={product.id} variants={RISE_FROM_BELOW} onClick={onNavigate}>
                        <ProductCard
                          product={product}
                          href={`/productos/${product.slug}`}
                          action="add-to-cart"
                        />
                      </m.div>
                    ))}
                  </div>
                ) : (
                  <m.p className={styles.emptyShelf} variants={RISE_FROM_BELOW}>
                    Muy pronto.
                  </m.p>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
