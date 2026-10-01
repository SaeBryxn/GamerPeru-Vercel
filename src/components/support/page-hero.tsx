"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Container } from "@/components/ui";
import styles from "./page-hero.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface PageHeroProps {
  eyebrow: string;
  title: string;
  description?: string;
  /** Extra line under the description, e.g. the last-updated date of a legal document. */
  meta?: string;
}

/**
 * Full-width dark header shared by the support and legal pages, with the footer's red glow
 * rising from the bottom edge. Its lines settle in one after another.
 */
export function PageHero({ eyebrow, title, description, meta }: PageHeroProps) {
  const reduceMotion = useReducedMotion();
  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  return (
    <header className={styles.hero}>
      <Container className={styles.inner}>
        <motion.p className={styles.eyebrow} {...enter(0)}>
          {eyebrow}
        </motion.p>
        <motion.h1 className={styles.title} {...enter(0.06)}>
          {title}
        </motion.h1>
        {description && (
          <motion.p className={styles.description} {...enter(0.12)}>
            {description}
          </motion.p>
        )}
        {meta && (
          <motion.p className={styles.meta} {...enter(0.18)}>
            {meta}
          </motion.p>
        )}
      </Container>
    </header>
  );
}
