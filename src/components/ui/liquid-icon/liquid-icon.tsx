"use client";

import React, { useEffect, useId } from "react";
import {
  animate,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import styles from "./liquid-icon.module.css";

export interface LiquidIconProps {
  /** Fills the icon while true; drains when it turns false. */
  active: boolean;
  size?: number;
  className?: string;
}

const EYE_OUTLINE =
  "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z";
const PUPIL_HOLE = "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z";

// Surface levels in viewBox units (0 = top of the 24x24 icon).
const EMPTY_LEVEL = 26;
const FULL_LEVEL = -3;
const WAVELENGTH = 12;
const MAX_AMPLITUDE = 1.6;

/**
 * Builds a closed shape whose top edge is a sine-like wave at `level`. The
 * wave spans three icon widths so `phase` can slide it without exposing gaps.
 */
function buildLiquidPath(level: number, phase: number): string {
  const depth = Math.min(Math.max((level - FULL_LEVEL) / (EMPTY_LEVEL - FULL_LEVEL), 0), 1);
  // Surface calms as it approaches the top so the fill settles flat.
  const amplitude = MAX_AMPLITUDE * Math.min(depth * 2.5, 1);
  const half = WAVELENGTH / 2;
  const start = -24 - (phase % WAVELENGTH);

  let path = `M${start} ${level}`;
  for (let i = 0; i < 12; i++) {
    const x = start + i * half;
    const crest = i % 2 === 0 ? level - amplitude : level + amplitude;
    path += ` Q${x + half / 2} ${crest} ${x + half} ${level}`;
  }
  return `${path} L48 30 L-24 30Z`;
}

export function LiquidIcon({ active, size = 16, className }: LiquidIconProps) {
  const clipId = `liquid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const prefersReducedMotion = useReducedMotion();
  const level = useMotionValue(EMPTY_LEVEL);
  const phase = useMotionValue(0);
  const liquidPath = useTransform(() => buildLiquidPath(level.get(), phase.get()));

  useEffect(() => {
    const target = active ? FULL_LEVEL : EMPTY_LEVEL;

    if (prefersReducedMotion) {
      level.set(target);
      return;
    }

    const controls: AnimationPlaybackControls[] = [
      animate(
        level,
        target,
        active
          ? { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0.35, ease: [0.4, 0, 1, 1] }
      ),
    ];
    if (active) {
      controls.push(
        animate(phase, phase.get() + WAVELENGTH * 4, { duration: 1.6, ease: "linear" })
      );
    }

    return () => controls.forEach((control) => control.stop());
  }, [active, prefersReducedMotion, level, phase]);

  return (
    <span
      className={[styles.liquidIcon, className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false" className={styles.svg}>
        <defs>
          <clipPath id={clipId}>
            <m.path d={liquidPath} />
          </clipPath>
        </defs>
        <path
          className={styles.fill}
          d={`${EYE_OUTLINE} ${PUPIL_HOLE}`}
          fillRule="evenodd"
          clipPath={`url(#${clipId})`}
        />
        <path className={styles.outline} d={EYE_OUTLINE} />
        <circle className={styles.outline} cx="12" cy="12" r="3" />
      </svg>
    </span>
  );
}
