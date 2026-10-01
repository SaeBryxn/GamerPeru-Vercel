"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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

const MotionLink = motion.create(Link);

const LAYOUT_VARIANTS = staggerVariants(0.12, 0.12);
const SERIES_VARIANTS = staggerVariants(0.08);
const PROMO_VARIANTS = staggerVariants(0.12, 0.1);

export interface MegaMenuSeriesProps {
  category: MegaMenuCategory;
  isOpen: boolean;
  onNavigate: () => void;
}

/**
 * Series lists on the left (with a guide link underneath) and large promo
 * cards on the right. Used by "Mouses", "Teclados" and "Mousepads".
 */
export function MegaMenuSeries({ category, isOpen, onNavigate }: MegaMenuSeriesProps) {
  const openCount = useOpenCount(isOpen);
  const series = category.series ?? [];
  const promos = category.promos ?? [];

  return (
    <motion.div
      key={openCount}
      className={styles.seriesLayout}
      variants={LAYOUT_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={styles.seriesZone} variants={SERIES_VARIANTS}>
        <h2 className={styles.visuallyHidden}>Series de {category.label}</h2>
        <div className={styles.seriesGrid}>
          {series.map((group) => (
            <motion.section
              key={group.title}
              className={styles.seriesGroup}
              variants={SLIDE_FROM_RIGHT}
            >
              <h3 className={styles.seriesTitle}>{group.title}</h3>
              <ul className={styles.seriesList}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={styles.seriesLink} onClick={onNavigate}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>
          ))}
        </div>

        <motion.div className={styles.seriesFooter} variants={SLIDE_FROM_RIGHT}>
          {category.guide && (
            <div className={styles.guideRow}>
              <MegaMenuArrowLink
                href={category.guide.href}
                className={styles.guideLink}
                arrowSize="lg"
                fullWidth
                onClick={onNavigate}
              >
                {category.guide.label}
              </MegaMenuArrowLink>
            </div>
          )}
          <MegaMenuArrowLink href={category.href} className={styles.allLink} onClick={onNavigate}>
            Ver todo en {category.label}
          </MegaMenuArrowLink>
        </motion.div>
      </motion.div>

      <motion.div className={styles.promoGrid} variants={PROMO_VARIANTS}>
        {promos.map((promo) => (
          <motion.div key={promo.href} variants={RISE_FROM_BELOW}>
            <MotionLink
              href={promo.href}
              className={styles.promoCard}
              onClick={onNavigate}
              initial="rest"
              animate="rest"
              whileHover="hover"
              whileFocus="hover"
            >
              {promo.badge && <span className={styles.promoBadge}>{promo.badge}</span>}
              <span className={styles.promoMedia}>
                <MegaMenuImage
                  src={promo.image}
                  sizes="(min-width: 1536px) 22vw, 25vw"
                  className={styles.promoImage}
                />
              </span>
              <span className={styles.promoFooter}>
                <span className={styles.promoTitle}>{promo.title}</span>
                <MegaMenuArrow size="md" />
              </span>
            </MotionLink>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
