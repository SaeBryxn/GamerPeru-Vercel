"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { DomeButton } from "@/components/ui";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./sticky-buy-bar.module.css";

/** Room the bar takes at the bottom, so floating buttons (WhatsApp, cookie notice) sit above it. */
const FLOATING_OFFSET = "88px";

export interface StickyBuyBarProps {
  /** The main add-to-cart button; the bar shows once it has scrolled up out of view. */
  anchorRef: React.RefObject<HTMLElement | null>;
  productName: string;
  variantTitle: string;
  thumbnailKey: string | null;
  priceCents: number;
  label: string;
  disabled: boolean;
  /** Receives the bar's own button, so focus returns there and the page does not jump. */
  onAdd: (button: HTMLElement) => void;
}

/**
 * Compact buy bar that follows the shopper through the story. It appears only after the main
 * add-to-cart button has left the viewport upwards (not while it is still below, as on a phone
 * before scrolling) and leaves again when that button comes back into view.
 */
export function StickyBuyBar({
  anchorRef,
  productName,
  variantTitle,
  thumbnailKey,
  priceCents,
  label,
  disabled,
  onAdd,
}: StickyBuyBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const thumbnailUrl = resolvePublicMediaUrl(thumbnailKey);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setIsVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorRef]);

  useEffect(() => {
    const root = document.documentElement;
    if (isVisible) root.style.setProperty("--floating-stack-offset", FLOATING_OFFSET);
    else root.style.removeProperty("--floating-stack-offset");
    return () => {
      root.style.removeProperty("--floating-stack-offset");
    };
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          className={styles.bar}
          role="region"
          aria-label="Compra rápida"
          initial={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          data-testid="sticky-buy-bar"
        >
          <div className={styles.thumb} aria-hidden="true">
            {thumbnailUrl && (
              <Image src={thumbnailUrl} alt="" fill sizes="56px" className={styles.thumbImage} />
            )}
          </div>
          <div className={styles.info}>
            <p className={styles.name}>{productName}</p>
            <p className={styles.variant}>{variantTitle}</p>
          </div>
          <p className={styles.price}>{formatCurrency(priceCents)}</p>
          <DomeButton
            tone="dark"
            className={styles.action}
            onClick={(event) => onAdd(event.currentTarget)}
            disabled={disabled}
            data-testid="sticky-buy-bar-add"
          >
            {label}
          </DomeButton>
        </m.div>
      )}
    </AnimatePresence>
  );
}
