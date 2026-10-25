"use client";

import React from "react";
import { m } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/catalog";
import { DomeButton, Icon } from "@/components/ui";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { useDragRail } from "../use-drag-rail";
import styles from "./product-carousel.module.css";

export interface ProductCarouselProps {
  id: string;
  eyebrow: string;
  title: string;
  products: ProductDiscoveryItem[];
}

/**
 * First sheet over the video stage: a horizontal rail of catalog cards, dragged,
 * flung or stepped with the dome arrows. The section always renders, even with
 * no products, because the hero scrolls to it to reveal the store.
 */
export function ProductCarousel({ id, eyebrow, title, products }: ProductCarouselProps) {
  const rail = useDragRail();

  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
      </div>

      {products.length > 0 && (
        <div className={styles.stage}>
          <div className={styles.viewport} ref={rail.viewportRef}>
            <m.ul
              ref={rail.trackRef}
              className={styles.track}
              style={rail.isTouch ? undefined : { x: rail.x }}
              drag={rail.isTouch ? false : "x"}
              dragConstraints={{ left: -rail.maxOffset, right: 0 }}
              dragElastic={0.12}
              onDragEnd={rail.onDragEnd}
              data-testid="product-carousel-track"
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
            </m.ul>
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
      )}
    </section>
  );
}
