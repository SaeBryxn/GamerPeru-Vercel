"use client";

import React from "react";
import { m } from "framer-motion";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./filter-drawer.module.css";

export interface PriceRangeSliderProps {
  /** Upper bound of the track, in cents. The lower bound is always 0. */
  maxBoundCents: number;
  minCents: number;
  maxCents: number;
  /** The top of the track is a ceiling, not the real maximum: label it "and up". */
  openEndedMax?: boolean;
  onChange: (minCents: number, maxCents: number) => void;
}

const STEP_CENTS = 100;
const THUMB_SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/**
 * Two native range inputs stacked on one track, so each handle keeps native
 * keyboard and screen-reader support. The handles cannot cross.
 */
export function PriceRangeSlider({
  maxBoundCents,
  minCents,
  maxCents,
  openEndedMax = false,
  onChange,
}: PriceRangeSliderProps) {
  const toPercent = (cents: number) => (maxBoundCents === 0 ? 0 : (cents / maxBoundCents) * 100);

  return (
    <div className={styles.slider}>
      <div className={styles.sliderTrack} aria-hidden="true">
        <m.span
          className={styles.sliderFill}
          initial={false}
          animate={{
            left: `${toPercent(minCents)}%`,
            right: `${100 - toPercent(maxCents)}%`,
          }}
          transition={THUMB_SPRING}
        />
      </div>

      <input
        type="range"
        className={styles.sliderInput}
        min={0}
        max={maxBoundCents}
        step={STEP_CENTS}
        value={minCents}
        onChange={(e) =>
          onChange(Math.min(Number(e.target.value), maxCents - STEP_CENTS), maxCents)
        }
        aria-label="Precio mínimo"
        aria-valuetext={formatCurrency(minCents)}
        data-testid="price-slider-min"
      />
      <input
        type="range"
        className={styles.sliderInput}
        min={0}
        max={maxBoundCents}
        step={STEP_CENTS}
        value={maxCents}
        onChange={(e) =>
          onChange(minCents, Math.max(Number(e.target.value), minCents + STEP_CENTS))
        }
        aria-label="Precio máximo"
        aria-valuetext={formatCurrency(maxCents)}
        data-testid="price-slider-max"
      />

      <div className={styles.sliderValues} aria-hidden="true">
        <span>{formatCurrency(minCents)}</span>
        <span>
          {formatCurrency(maxCents)}
          {openEndedMax && maxCents >= maxBoundCents ? "+" : ""}
        </span>
      </div>
    </div>
  );
}
