"use client";

import React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { HomeImage } from "../home-image";
import styles from "./split-showcase.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO, staggerChildren: 0.1 },
  },
};

const BLOCK_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

export interface ShowcaseFeature {
  title: string;
  description: string;
}

export interface SplitShowcaseProps {
  eyebrow: string;
  title: string;
  features: ShowcaseFeature[];
  image: { src: string; alt: string };
}

/**
 * Split editorial block: a colored stage with a floating product shot on the
 * left, headline and feature list on the right.
 */
export function SplitShowcase({ eyebrow, title, features, image }: SplitShowcaseProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      className={styles.section}
      aria-labelledby="split-showcase-title"
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      data-testid="split-showcase"
    >
      <motion.div className={styles.stage} variants={BLOCK_VARIANTS}>
        <div className={styles.panel} aria-hidden="true" />
        <motion.div
          className={styles.floatingImage}
          animate={prefersReducedMotion ? undefined : { y: [0, -18, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <HomeImage src={image.src} alt={image.alt} sizes="(max-width: 1023px) 90vw, 40vw" />
        </motion.div>
      </motion.div>

      <div className={styles.content}>
        <motion.h2 id="split-showcase-title" className={styles.title} variants={BLOCK_VARIANTS}>
          {title}
        </motion.h2>
        <motion.p className={styles.eyebrow} variants={BLOCK_VARIANTS}>
          {eyebrow}
        </motion.p>

        <motion.dl className={styles.features} variants={BLOCK_VARIANTS}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.feature}>
              <dt className={styles.featureTitle}>{feature.title}</dt>
              <dd className={styles.featureText}>{feature.description}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </motion.section>
  );
}
