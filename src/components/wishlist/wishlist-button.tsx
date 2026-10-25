"use client";

import React from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { useOptionalWishlist } from "./wishlist-provider";
import styles from "./wishlist-button.module.css";

const POP = { type: "spring", stiffness: 520, damping: 14, mass: 0.6 } as const;
const PRESS = { type: "spring", stiffness: 600, damping: 30 } as const;

export interface WishlistButtonProps {
  productId: string;
  productName: string;
  /** `overlay`: round glass button over a product image. `inline`: bordered, next to other actions. */
  variant?: "overlay" | "inline";
  className?: string;
}

/**
 * Heart toggle. The outline stays put while a filled heart springs in on top of it, overshooting
 * slightly so saving reads as a "pop"; a ring bursts out once from behind it.
 */
export function WishlistButton({
  productId,
  productName,
  variant = "overlay",
  className,
}: WishlistButtonProps) {
  const wishlist = useOptionalWishlist();
  const reduceMotion = useReducedMotion();
  if (!wishlist) return null;
  const { isSaved, isPending, toggle } = wishlist;
  const saved = isSaved(productId);

  return (
    <m.button
      type="button"
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      aria-pressed={saved}
      aria-label={
        saved ? `Quitar ${productName} de favoritos` : `Añadir ${productName} a favoritos`
      }
      aria-busy={isPending(productId) || undefined}
      data-saved={saved || undefined}
      whileHover={reduceMotion ? undefined : { scale: 1.08 }}
      whileTap={reduceMotion ? undefined : { scale: 0.86 }}
      transition={PRESS}
      onClick={(event) => {
        // Hearts sit inside clickable cards; saving must not open the product.
        event.preventDefault();
        event.stopPropagation();
        void toggle(productId, productName);
      }}
    >
      <span className={styles.glyph} aria-hidden="true">
        <Heart className={styles.outline} size={18} strokeWidth={2} />
        <AnimatePresence initial={false}>
          {saved && (
            <m.span
              key="fill"
              className={styles.fill}
              initial={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { scale: 0.4, opacity: 0, transition: { duration: 0.14 } }
              }
              transition={POP}
            >
              <Heart size={18} strokeWidth={2} fill="currentColor" />
            </m.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {saved && !reduceMotion && (
            <m.span
              key="burst"
              className={styles.burst}
              initial={{ scale: 0.6, opacity: 0.55 }}
              animate={{ scale: 1.9, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
      </span>
    </m.button>
  );
}
