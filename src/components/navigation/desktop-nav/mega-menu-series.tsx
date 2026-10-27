"use client";

import React from "react";
import Link from "@/components/app-link";
import { m } from "framer-motion";
import type { MegaMenuCategory } from "../types";
import { MegaMenuArrow, MegaMenuArrowLink } from "./mega-menu-arrow-link";
import { MegaMenuImage } from "./mega-menu-image";
import {
  RISE_FROM_BELOW,
  SLIDE_FROM_RIGHT,
  staggerVariants,
  useOpenCount,
} from "./mega-menu-motion";
import styles from "./mega-menu-series.module.css";

const LAYOUT_VARIANTS = staggerVariants(0.12, 0.12);
const SERIES_VARIANTS = staggerVariants(0.08);
const PROMO_VARIANTS = staggerVariants(0.12, 0.1);

export interface MegaMenuSeriesProps {
  category: MegaMenuCategory;
  isOpen: boolean;
  onNavigate: () => void;
}

/**
 * Series lists on the left (with a "Ver más" link to the category underneath) and large promo
 * cards on the right. Used by "Mouses", "Teclados" and "Mousepads".
 */
export function MegaMenuSeries({ category, isOpen, onNavigate }: MegaMenuSeriesProps) {
  const openCount = useOpenCount(isOpen);
  const series = category.series ?? [];
  const promos = category.promos ?? [];

  return (
    <m.div
      key={openCount}
      className={styles.seriesLayout}
      variants={LAYOUT_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <m.div className={styles.seriesZone} variants={SERIES_VARIANTS}>
        <h2 className={styles.visuallyHidden}>Series de {category.label}</h2>
        <div className={styles.seriesGrid} data-single-brand={series.length === 1}>
          {series.map((group) => (
            <m.section key={group.title} className={styles.seriesGroup} variants={SLIDE_FROM_RIGHT}>
              <h3 className={styles.seriesTitle}>{group.title}</h3>
              <ul className={styles.seriesList}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.description ?? item.label}
                      className={styles.seriesLink}
                      onClick={onNavigate}
                    >
                      <span className={styles.linkLabel}>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {group.more && (
                <MegaMenuArrowLink
                  href={group.more.href}
                  className={styles.brandMore}
                  onClick={onNavigate}
                >
                  {group.more.label}
                </MegaMenuArrowLink>
              )}
            </m.section>
          ))}
        </div>

        {/* Leads to the whole category, so a short list never reads as everything there is. */}
        <m.div className={styles.seriesFooter} variants={SLIDE_FROM_RIGHT}>
          <div className={styles.moreRow}>
            <MegaMenuArrowLink
              href={category.href}
              className={styles.moreLink}
              arrowSize="lg"
              fullWidth
              onClick={onNavigate}
            >
              Ver todos los productos
            </MegaMenuArrowLink>
          </div>
        </m.div>
      </m.div>

      <m.div className={styles.promoGrid} variants={PROMO_VARIANTS}>
        {promos.map((promo) => (
          <m.div key={promo.href} className={styles.promoItem} variants={RISE_FROM_BELOW}>
            <Link href={promo.href} className={styles.promoCard} onClick={onNavigate}>
              {promo.badge && <span className={styles.promoBadge}>{promo.badge}</span>}
              <span className={styles.promoMedia}>
                <MegaMenuImage
                  src={promo.image}
                  sizes="(min-width: 1536px) 22vw, 25vw"
                  className={styles.promoImage}
                />
              </span>
              <span className={styles.promoFooter}>
                <span className={styles.promoTitle}>
                  <span className={styles.linkLabel}>{promo.title}</span>
                </span>
                <MegaMenuArrow size="md" />
              </span>
            </Link>
          </m.div>
        ))}
      </m.div>
    </m.div>
  );
}
