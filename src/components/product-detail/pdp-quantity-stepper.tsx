"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon, VisuallyHidden } from "@/components/ui";
import styles from "./pdp-quantity-stepper.module.css";

const SNAPPY_SPRING = { type: "spring", stiffness: 520, damping: 32 } as const;

// Step buttons: soft fill on hover, quick press on tap.
const STEP_VARIANTS: Variants = {
  rest: { backgroundColor: "var(--color-surface-card)", scale: 1 },
  hover: { backgroundColor: "var(--color-surface-secondary)", scale: 1 },
  tap: { scale: 0.86 },
};

// The number rolls up when increasing and down when decreasing.
const VALUE_VARIANTS: Variants = {
  enter: (direction: number) => ({ y: direction * 14, opacity: 0 }),
  center: { y: 0, opacity: 1, transition: SNAPPY_SPRING },
  exit: (direction: number) => ({
    y: direction * -14,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

export interface PdpQuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** `< 1 >` quantity control sized to sit beside the add-to-cart button. */
export function PdpQuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
}: PdpQuantityStepperProps) {
  const [direction, setDirection] = useState(1);

  const step = (delta: 1 | -1) => {
    const next = Math.min(Math.max(value + delta, min), max);
    if (next === value) return;
    setDirection(delta);
    onChange(next);
  };

  const renderStep = (delta: 1 | -1) => {
    const isDisabled = disabled || (delta < 0 ? value <= min : value >= max);
    return (
      <motion.button
        type="button"
        className={styles.stepButton}
        onClick={() => step(delta)}
        disabled={isDisabled}
        aria-label={delta < 0 ? "Disminuir cantidad" : "Aumentar cantidad"}
        variants={STEP_VARIANTS}
        initial="rest"
        animate="rest"
        whileHover={isDisabled ? undefined : "hover"}
        whileTap={isDisabled ? undefined : "tap"}
        transition={SNAPPY_SPRING}
        data-testid={delta < 0 ? "pdp-quantity-decrease" : "pdp-quantity-increase"}
      >
        <Icon icon={delta < 0 ? ChevronLeft : ChevronRight} size="sm" aria-hidden="true" />
      </motion.button>
    );
  };

  return (
    <div className={styles.stepper} role="group" aria-label="Cantidad">
      {renderStep(-1)}
      {/*
        The rolling digits are decorative: while one exits and the next enters,
        both are briefly in the DOM. Assistive tech reads the hidden live value.
      */}
      <span className={styles.value} aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={value}
            className={styles.valueDigit}
            custom={direction}
            variants={VALUE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <VisuallyHidden aria-live="polite" data-testid="pdp-quantity-value">
        {value}
      </VisuallyHidden>
      {renderStep(1)}
    </div>
  );
}
