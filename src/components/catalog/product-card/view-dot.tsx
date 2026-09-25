"use client";

import React from "react";
import { motion, type Transition } from "framer-motion";
import styles from "./view-dot.module.css";

// Underdamped so the fill overshoots and settles: the active dot lands with a small bounce.
const FILL_TRANSITION: Transition = { type: "spring", stiffness: 520, damping: 14, mass: 0.6 };
const TINT_TRANSITION: Transition = { duration: 0.25, ease: "easeOut" };

export interface ViewDotProps {
  isActive: boolean;
  size?: number;
}

/**
 * Photo indicator: an ink outline at rest; when its photo is showing, a brand-red fill springs in
 * and the outline warms to match.
 */
export function ViewDot({ isActive, size = 7 }: ViewDotProps): React.JSX.Element {
  return (
    <motion.span
      className={styles.dot}
      style={{ width: size, height: size }}
      data-active={isActive}
      initial={false}
      animate={{
        borderColor: isActive ? "var(--color-brand-red)" : "var(--color-text-primary)",
      }}
      transition={TINT_TRANSITION}
    >
      <motion.span
        className={styles.fill}
        initial={false}
        animate={{ scale: isActive ? 1 : 0 }}
        transition={FILL_TRANSITION}
      />
    </motion.span>
  );
}
