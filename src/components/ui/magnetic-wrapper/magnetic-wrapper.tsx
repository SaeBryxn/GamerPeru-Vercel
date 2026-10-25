"use client";

import React from "react";
import { m, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import styles from "./magnetic-wrapper.module.css";

export interface MagneticWrapperProps {
  children: React.ReactNode;
  /** Fraction of the cursor's distance from center that the content follows. */
  strength?: number;
  /** Upper bound for the displacement on each axis, in pixels. */
  maxOffset?: number;
  className?: string;
}

// Low damping relative to stiffness gives a single soft overshoot when released.
const SPRING = { stiffness: 260, damping: 14, mass: 0.5 };

export function MagneticWrapper({
  children,
  strength = 0.35,
  maxOffset = 6,
  className,
}: MagneticWrapperProps) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);

  function handlePointerMove(event: React.PointerEvent<HTMLSpanElement>) {
    if (prefersReducedMotion || event.pointerType !== "mouse") return;

    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-maxOffset, Math.min(maxOffset, value));

    x.set(clamp((event.clientX - (left + width / 2)) * strength));
    y.set(clamp((event.clientY - (top + height / 2)) * strength));
  }

  function handlePointerLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <span
      className={[styles.magnetic, className].filter(Boolean).join(" ")}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <m.span className={styles.content} style={{ x: springX, y: springY }}>
        {children}
      </m.span>
    </span>
  );
}
