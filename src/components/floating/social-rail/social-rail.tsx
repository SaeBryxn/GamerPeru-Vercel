"use client";

import React from "react";
import { motion } from "framer-motion";
import { BrandGlyph, DomeButton, DomeLink } from "@/components/ui";
import { PROMO_PILL, SOCIAL_LINKS } from "@/config/social-links";
import styles from "./social-rail.module.css";

const HOVER_SPRING = { type: "spring", stiffness: 420, damping: 24 } as const;

/**
 * Floating pill rail pinned to the left edge, slightly above the middle:
 * social profiles on top, promo pill at the base. Desktop only, so it never
 * covers the mobile layout. Icons carry the same dome hover as the navigation.
 */
export function SocialRail() {
  return (
    <motion.aside
      className={styles.rail}
      aria-label="Redes sociales de Gamer Perú"
      initial={{ opacity: 0, x: -24, y: "-50%" }}
      animate={{ opacity: 1, x: 0, y: "-50%" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
      data-testid="social-rail"
    >
      <ul className={styles.list}>
        {SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
            {link.href ? (
              <DomeLink
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                tone="light"
                domeRise="-75%"
                className={styles.item}
                aria-label={`${link.label} de Gamer Perú`}
              >
                <BrandGlyph id={link.id} />
              </DomeLink>
            ) : (
              /*
               * No profile configured yet: it keeps the same look and hover as
               * the real ones, but stays out of the tab order and of the
               * accessibility tree instead of leading nowhere.
               */
              <DomeButton
                tone="light"
                domeRise="-75%"
                className={styles.item}
                tabIndex={-1}
                aria-hidden="true"
                title={`${link.label}: perfil pendiente de configurar`}
              >
                <BrandGlyph id={link.id} />
              </DomeButton>
            )}
          </li>
        ))}
      </ul>

      {PROMO_PILL.href ? (
        <motion.a
          href={PROMO_PILL.href}
          className={styles.promo}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          transition={HOVER_SPRING}
          data-testid="social-rail-promo"
        >
          {PROMO_PILL.label}
        </motion.a>
      ) : (
        <motion.span
          className={styles.promo}
          whileHover={{ scale: 1.06 }}
          transition={HOVER_SPRING}
          title="Descuento pendiente de configurar"
          aria-hidden="true"
          data-testid="social-rail-promo"
        >
          {PROMO_PILL.label}
        </motion.span>
      )}
    </motion.aside>
  );
}
