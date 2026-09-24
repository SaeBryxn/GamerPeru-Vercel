"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import { DomeLink } from "@/components/ui";
import { SOCIAL_LINKS } from "@/config/social-links";
import { HomeImage } from "../home-image";
import styles from "./community-banner.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

const BANNER_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO, staggerChildren: 0.08 },
  },
};

const BLOCK_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

export interface CommunityBannerProps {
  eyebrow: string;
  /** Rendered on two lines. */
  title: [string, string];
  description: string;
  ctaLabel: string;
  background: { src: string; alt: string };
}

/** Dark community banner over an illustrated backdrop. */
export function CommunityBanner({
  eyebrow,
  title,
  description,
  ctaLabel,
  background,
}: CommunityBannerProps) {
  const discordHref = SOCIAL_LINKS.find((link) => link.id === "discord")?.href ?? "";

  return (
    <motion.section
      className={styles.section}
      aria-labelledby="community-title"
      variants={BANNER_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      data-testid="community-banner"
    >
      <div className={styles.banner}>
        <div className={styles.background} aria-hidden="true">
          <HomeImage src={background.src} alt={background.alt} sizes="100vw" />
        </div>
        <div className={styles.scrim} aria-hidden="true" />

        <motion.div className={styles.content} variants={BLOCK_VARIANTS}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id="community-title" className={styles.title}>
            {title[0]} <br />
            {title[1]}
          </h2>
          <p className={styles.description}>{description}</p>

          {discordHref ? (
            <DomeLink
              href={discordHref}
              target="_blank"
              rel="noopener noreferrer"
              tone="light"
              className={styles.cta}
              data-testid="community-banner-cta"
            >
              {ctaLabel}
            </DomeLink>
          ) : (
            // No community link configured yet (see src/config/social-links.ts).
            <span
              className={`${styles.cta} ${styles.ctaPending}`}
              title="Enlace de la comunidad pendiente de configurar"
              aria-hidden="true"
              data-testid="community-banner-cta"
            >
              {ctaLabel}
            </span>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
}
