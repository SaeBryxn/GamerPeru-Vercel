"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DomeButton, Icon } from "@/components/ui";
import {
  inventoryFamilies,
  productHref,
  type InventoryCategorySlug,
  type InventoryFamily,
} from "@/lib/catalog/storefront-inventory";
import { useDragRail } from "../use-drag-rail";
import styles from "./product-carousel.module.css";

const CATEGORY_LABELS: Record<InventoryCategorySlug, string> = {
  mouses: "Mouse gaming",
  mousepads: "Mousepad",
  accesorios: "Accesorio",
};

function subtitleFor(family: InventoryFamily): string {
  const kind =
    family.lead.specValues.accessory_type === "skates"
      ? "Skates"
      : CATEGORY_LABELS[family.categorySlug];
  return `${family.brand.name}, ${kind}`;
}

export interface ProductCarouselProps {
  id: string;
  eyebrow: string;
  title: string;
}

/**
 * Horizontal product rail: drag or fling it, or step with the dome arrows.
 * Cards group the colorways of one model, and the superscript is how many
 * versions that model has.
 */
export function ProductCarousel({ id, eyebrow, title }: ProductCarouselProps) {
  const [families] = useState(() => inventoryFamilies());
  const rail = useDragRail();

  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
      </div>

      <div className={styles.stage}>
        <div className={styles.viewport} ref={rail.viewportRef}>
          <motion.ul
            ref={rail.trackRef}
            className={styles.track}
            style={{ x: rail.x }}
            drag="x"
            dragConstraints={{ left: -rail.maxOffset, right: 0 }}
            dragElastic={0.12}
            onDragEnd={rail.onDragEnd}
            data-testid="product-carousel-track"
          >
            {families.map((family) => (
              <li key={family.id} className={styles.card}>
                <Link href={productHref(family.lead)} className={styles.cardLink} draggable={false}>
                  <span className={styles.media}>
                    <Image
                      src={family.lead.imagePlaceholder}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 70vw, 280px"
                      className={styles.image}
                      draggable={false}
                    />
                  </span>
                  <span className={styles.cardTitle}>
                    {family.name}
                    {family.items.length > 1 && (
                      <sup className={styles.superscript}>{family.items.length}</sup>
                    )}
                  </span>
                  <span className={styles.cardSubtitle}>{subtitleFor(family)}</span>
                </Link>
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
            data-testid="product-carousel-prev"
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
            data-testid="product-carousel-next"
          >
            <Icon icon={ChevronRight} size="lg" aria-hidden="true" />
          </DomeButton>
        </span>
      </div>
    </section>
  );
}
