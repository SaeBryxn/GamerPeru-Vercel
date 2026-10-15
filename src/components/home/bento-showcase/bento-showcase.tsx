"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import { HomeImage } from "../home-image";
import styles from "./bento-showcase.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO, staggerChildren: 0.1 },
  },
};

const TILE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

const HOVER_SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;

export interface BentoShowcaseProps {
  /** Split so the second half can carry the accent color. */
  title: [string, string];
  description: string;
  images: [
    { src: string | null; alt: string },
    { src: string | null; alt: string },
    { src: string | null; alt: string },
  ];
}

/** Copy on the left, asymmetric image grid on the right. */
export function BentoShowcase({ title, description, images }: BentoShowcaseProps) {
  const [wide, square, tall] = images;

  return (
    <motion.section
      className={styles.section}
      aria-labelledby="bento-title"
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      data-testid="bento-showcase"
    >
      <motion.div className={styles.content} variants={TILE_VARIANTS}>
        <h2 id="bento-title" className={styles.title}>
          {title[0]} <span className={styles.titleAccent}>{title[1]}</span>
        </h2>
        <p className={styles.description}>{description}</p>
      </motion.div>

      <div className={styles.grid}>
        <motion.div
          className={`${styles.tile} ${styles.tileWide}`}
          variants={TILE_VARIANTS}
          whileHover={{ scale: 1.03 }}
          transition={HOVER_SPRING}
        >
          <HomeImage src={wide.src} alt={wide.alt} sizes="(max-width: 1023px) 90vw, 30vw" />
        </motion.div>
        <motion.div
          className={`${styles.tile} ${styles.tileSquare}`}
          variants={TILE_VARIANTS}
          whileHover={{ scale: 1.03 }}
          transition={HOVER_SPRING}
        >
          <HomeImage src={square.src} alt={square.alt} sizes="(max-width: 1023px) 45vw, 30vw" />
        </motion.div>
        <motion.div
          className={`${styles.tile} ${styles.tileTall}`}
          variants={TILE_VARIANTS}
          whileHover={{ scale: 1.03 }}
          transition={HOVER_SPRING}
        >
          <HomeImage src={tall.src} alt={tall.alt} sizes="(max-width: 1023px) 45vw, 30vw" />
        </motion.div>
      </div>
    </motion.section>
  );
}
