"use client";

import React from "react";
import { AnimatePresence, motion, type Transition, type Variants } from "framer-motion";
import { Cpu, Crosshair, Layers, MousePointerClick, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui";
import styles from "./spec-swap-bar.module.css";

export type SpecIconName = "crosshair" | "chip" | "material" | "switch";

export interface ProductSpec {
  icon: SpecIconName;
  title: string;
  value: string;
}

/** Two specs shown at rest and two revealed while the card is active. */
export interface ProductSpecPair {
  rest: readonly [ProductSpec, ProductSpec];
  active: readonly [ProductSpec, ProductSpec];
}

const SPEC_ICONS: Record<SpecIconName, LucideIcon> = {
  crosshair: Crosshair,
  chip: Cpu,
  material: Layers,
  switch: MousePointerClick,
};

// direction +1: the active pair arrives from the right; -1: the rest pair returns from the left.
const SLIDE_VARIANTS: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%" }),
};

// Same spring as the mega-menu image carousel, so every swish in the store matches.
export const SWISH_TRANSITION: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 32,
  mass: 0.8,
};

export interface SpecSwapBarProps {
  specs: ProductSpecPair;
  active: boolean;
  transition?: Transition;
}

/**
 * Two-column spec strip. When the card becomes active the current pair slides
 * out to the left while the next pair slides in from the right, and back again
 * when it rests — the same carousel motion as the image scrubbing.
 */
export function SpecSwapBar({ specs, active, transition = SWISH_TRANSITION }: SpecSwapBarProps) {
  const pair = active ? specs.active : specs.rest;
  const direction = active ? 1 : -1;

  return (
    <div className={styles.specBar}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={active ? "active" : "rest"}
          className={styles.specRow}
          custom={direction}
          variants={SLIDE_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >
          {pair.map((spec) => (
            <div key={spec.title} className={styles.spec}>
              <Icon
                icon={SPEC_ICONS[spec.icon]}
                size="md"
                className={styles.specIcon}
                aria-hidden="true"
              />
              <div className={styles.specText}>
                <span className={styles.specTitle}>{spec.title}</span>
                <span className={styles.specValue}>{spec.value}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
