"use client";

import React from "react";
import Link from "@/components/app-link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/catalog";
import { DomeButton, Icon } from "@/components/ui";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { useDragRail } from "../use-drag-rail";
import styles from "./catalog-rail.module.css";

export interface CatalogRailProps {
  id: string;
  eyebrow: string;
  title: string;
  products: ProductDiscoveryItem[];
  /** Link to the full category listing. */
  seeAll: { label: string; href: string };
}

/**
 * Horizontal rail of catalog cards: the same card as the category grid,
 * dragged or stepped with the dome arrows.
 */
export function CatalogRail({ id, eyebrow, title, products, seeAll }: CatalogRailProps) {
  const rail = useDragRail();

  if (products.length === 0) return null;

  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={`${id}-title`} className={styles.title}>
            {title}
          </h2>
        </div>
        <Link href={seeAll.href} className={styles.seeAll}>
          {seeAll.label}
        </Link>
      </div>

      <div className={styles.stage}>
        <div className={styles.viewport} ref={rail.viewportRef}>
          <motion.ul
            ref={rail.trackRef}
            className={styles.track}
            style={rail.isTouch ? undefined : { x: rail.x }}
            drag={rail.isTouch ? false : "x"}
            dragConstraints={{ left: -rail.maxOffset, right: 0 }}
            dragElastic={0.12}
            onDragEnd={rail.onDragEnd}
            data-testid={`${id}-track`}
          >
            {products.map((product) => (
              <li key={product.id} className={styles.card}>
                <ProductCard
                  product={product}
                  href={`/productos/${product.slug}`}
                  gallerySwipe={false}
                />
              </li>
            ))}
          </motion.ul>
        </div>

        <span className={`${styles.arrowSlot} ${styles.arrowSlotPrev}`}>
          <DomeButton
            tone="light"
            domeRise="-75%"
            className={styles.arrow}
            onClick={rail.goBack}
            disabled={!rail.canGoBack}
            aria-label="Productos anteriores"
            data-testid={`${id}-prev`}
          >
            <Icon icon={ChevronLeft} size="lg" aria-hidden="true" />
          </DomeButton>
        </span>
        <span className={`${styles.arrowSlot} ${styles.arrowSlotNext}`}>
          <DomeButton
            tone="light"
            domeRise="-75%"
            className={styles.arrow}
            onClick={rail.goForward}
            disabled={!rail.canGoForward}
            aria-label="Productos siguientes"
            data-testid={`${id}-next`}
          >
            <Icon icon={ChevronRight} size="lg" aria-hidden="true" />
          </DomeButton>
        </span>
      </div>
    </section>
  );
}
