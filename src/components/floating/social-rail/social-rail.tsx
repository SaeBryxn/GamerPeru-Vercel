"use client";

import React from "react";
import { m } from "framer-motion";
import { BrandGlyph, DomeLink } from "@/components/ui";
import { ACTIVE_SOCIAL_LINKS, PROMO_PILL, PROMO_PILL_ENABLED } from "@/config/social-links";
import styles from "./social-rail.module.css";

const HOVER_SPRING = { type: "spring", stiffness: 420, damping: 24 } as const;

/**
 * Floating pill rail pinned to the left edge, slightly above the middle:
 * social profiles on top, promo pill at the base when a campaign is on. Desktop only, so it never
 * covers the mobile layout. Icons carry the same dome hover as the navigation.
 */
export function SocialRail() {
  return (
    <m.aside
      className={styles.rail}
      aria-label="Redes sociales de Gamer Perú"
      initial={{ opacity: 0, x: -24, y: "-50%" }}
      animate={{ opacity: 1, x: 0, y: "-50%" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
      data-testid="social-rail"
    >
      <ul className={styles.list}>
        {ACTIVE_SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
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
          </li>
        ))}
      </ul>

      {PROMO_PILL_ENABLED && PROMO_PILL.href && (
        <m.a
          href={PROMO_PILL.href}
          className={styles.promo}
          // The pill reads bottom-to-top; the half turn lives in Framer so hovering keeps it.
          style={{ rotate: 180 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          transition={HOVER_SPRING}
          data-testid="social-rail-promo"
        >
          {PROMO_PILL.label}
        </m.a>
      )}
    </m.aside>
  );
}
