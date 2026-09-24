"use client";

import { useState } from "react";
import type { Variants } from "framer-motion";

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

/** Parent variants that reveal their motion children one after another. */
export function staggerVariants(staggerChildren: number, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren, delayChildren } },
  };
}

/** Fade in while sliding from the right toward the left. */
export const SLIDE_FROM_RIGHT: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

/** Fade in while rising from below. */
export const RISE_FROM_BELOW: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

/**
 * Counts how many times a panel has opened. Used as a React key so a panel's
 * contents remount (and replay their staggered entrance) on every open, while
 * staying mounted through the close animation. Derived during render so the
 * remount lands in the same commit that reveals the panel.
 */
export function useOpenCount(isOpen: boolean): number {
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [openCount, setOpenCount] = useState(0);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenCount((count) => count + 1);
  }

  return openCount;
}
