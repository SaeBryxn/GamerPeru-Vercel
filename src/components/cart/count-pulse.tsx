"use client";

import React from "react";
import { motion, type Transition } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/ui/use-prefers-reduced-motion";
import styles from "./count-pulse.module.css";

const BEAT: Transition = { duration: 0.55, times: [0, 0.35, 0.7, 1], ease: "easeOut" };
const RIPPLE: Transition = { duration: 0.7, ease: "easeOut" };

export interface CountPulseProps {
  value: number;
  /** What is shown; defaults to the value itself (the header badge caps it at 99+). */
  label?: string;
  /** The consumer's shape; it must establish positioning so the ripple follows its outline. */
  className?: string;
}

/**
 * A count that beats once whenever it changes: it swells and a red ring ripples out from its
 * edge. Keying on the value remounts the element, which replays the beat without an effect.
 */
export function CountPulse({ value, label, className }: CountPulseProps): React.JSX.Element {
  const allowMotion = usePrefersReducedMotion() === false;

  return (
    <motion.span
      key={value}
      className={[styles.root, className].filter(Boolean).join(" ")}
      initial={false}
      animate={allowMotion ? { scale: [1, 1.3, 0.94, 1] } : undefined}
      transition={BEAT}
    >
      {allowMotion && (
        <motion.span
          className={styles.ring}
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={RIPPLE}
          aria-hidden="true"
        />
      )}
      {label ?? value}
    </motion.span>
  );
}
