"use client";

import React from "react";
import { AnimatePresence, motion, type Transition, type Variants } from "framer-motion";
import {
  BatteryFull,
  Cpu,
  Crosshair,
  Feather,
  Hand,
  Layers,
  MousePointerClick,
  Radio,
  Ruler,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui";
import type { ProductCardSpec } from "@/lib/catalog/card-specs";
import styles from "./spec-swap-bar.module.css";

const SPEC_ICONS: Record<string, LucideIcon> = {
  sensor: Crosshair,
  polling: Radio,
  mcu: Cpu,
  switches: MousePointerClick,
  peso: Feather,
  bateria: BatteryFull,
  forma: Hand,
  material: Layers,
  superficie: Layers,
  base: Layers,
  largo: Ruler,
  ancho: Ruler,
  grosor: Ruler,
};

// The outgoing pair lifts away while the next one rises into its place.
const SWAP_VARIANTS: Variants = {
  enter: (direction: number) => ({ y: direction > 0 ? "70%" : "-70%", opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (direction: number) => ({ y: direction > 0 ? "-70%" : "70%", opacity: 0 }),
};

const SWAP_TRANSITION: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 0.7 };

export interface SpecSwapBarProps {
  /** The card's specs in schema order: the first two rest, the next two show while active. */
  specs: readonly ProductCardSpec[];
  active: boolean;
}

function SpecCell({ spec }: { spec: ProductCardSpec }) {
  return (
    <div className={styles.spec}>
      <Icon
        icon={SPEC_ICONS[spec.key] ?? SlidersHorizontal}
        size="md"
        className={styles.specIcon}
        aria-hidden="true"
      />
      <div className={styles.specText}>
        <span className={styles.specTitle}>{spec.label}</span>
        <span className={styles.specValue}>{spec.value}</span>
      </div>
    </div>
  );
}

/**
 * Technical strip at the base of a card. With three or more specs, activating the card swaps the
 * resting pair for the next one; with two it simply holds them. All values stay in the markup so
 * assistive technology reads the full set regardless of hover.
 */
export function SpecSwapBar({ specs, active }: SpecSwapBarProps): React.JSX.Element | null {
  if (specs.length < 2) return null;

  const restPair = specs.slice(0, 2);
  const activePair = specs.slice(2, 4);
  const canSwap = activePair.length > 0;
  const showActive = canSwap && active;
  const pair = showActive ? activePair : restPair;
  const direction = showActive ? 1 : -1;

  return (
    <div className={styles.specBar}>
      <dl className={styles.srOnly}>
        {specs.map((spec) => (
          <div key={spec.key}>
            <dt>{spec.label}</dt>
            <dd>{spec.value}</dd>
          </div>
        ))}
      </dl>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={showActive ? "active" : "rest"}
          className={styles.specRow}
          custom={direction}
          variants={SWAP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={SWAP_TRANSITION}
          aria-hidden="true"
        >
          {pair.map((spec) => (
            <SpecCell key={spec.key} spec={spec} />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
