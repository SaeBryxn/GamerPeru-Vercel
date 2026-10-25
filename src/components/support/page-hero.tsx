"use client";

import React from "react";
import { m, useReducedMotion } from "framer-motion";
import styles from "./page-hero.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface PageHeroProps {
  title: string;
  description?: string;
  /** Small line under the description, e.g. the last-updated date of a legal document. */
  meta?: string;
  /** Overline above the title; support pages leave it out, legal pages name the section. */
  eyebrow?: string;
}

/**
 * Header shared by the support and legal pages: a massive left-aligned title on the page
 * surface with a quiet intro under it. Its lines settle in one after another.
 */
export function PageHero({ title, description, meta, eyebrow }: PageHeroProps) {
  const reduceMotion = useReducedMotion();
  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  return (
    <header className={styles.hero}>
      {eyebrow && (
        <m.p className={styles.eyebrow} {...enter(0)}>
          {eyebrow}
        </m.p>
      )}
      <m.h1 className={styles.title} {...enter(0.04)}>
        {title}
      </m.h1>
      {description && (
        <m.p className={styles.description} {...enter(0.12)}>
          {description}
        </m.p>
      )}
      {meta && (
        <m.p className={styles.meta} {...enter(0.18)}>
          {meta}
        </m.p>
      )}
    </header>
  );
}
