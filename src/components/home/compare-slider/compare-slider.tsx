"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { m, useMotionValue, useMotionValueEvent, useTransform, type Variants } from "framer-motion";
import { GripVertical } from "lucide-react";
import { Icon } from "@/components/ui";
import { HomeImage } from "../home-image";
import styles from "./compare-slider.module.css";

const KEYBOARD_STEP_RATIO = 0.05;

// While the handle is held the line and grip flash to the brand red, so the grab reads as live.
const HANDLE_LINE_VARIANTS: Variants = {
  idle: { backgroundColor: "var(--color-surface-card)", transition: { duration: 0.25 } },
  held: { backgroundColor: "var(--color-brand-red)", transition: { duration: 0.12 } },
};

const HANDLE_GRIP_VARIANTS: Variants = {
  idle: { color: "var(--color-accent-violet-deep)", scale: 1, transition: { duration: 0.25 } },
  held: { color: "var(--color-brand-red)", scale: 1.08, transition: { duration: 0.12 } },
};

export interface CompareSide {
  /** Small line above the name. */
  kicker: string;
  name: string;
  image: { src: string | null; alt: string };
}

export interface CompareSliderProps {
  eyebrow: string;
  title: string;
  left: CompareSide;
  right: CompareSide;
}

/**
 * Curtain comparison: dragging across the stage moves a clip over the left image,
 * revealing the right one underneath. The handle is also a slider for keyboard
 * users, so the comparison never depends on pointer dragging.
 */
export function CompareSlider({ eyebrow, title, left, right }: CompareSliderProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const [percent, setPercent] = useState(50);
  const [isHeld, setIsHeld] = useState(false);
  // Read by the move handler, which can run before the release has re-rendered.
  const heldRef = useRef(false);

  // The left image is clipped to everything on the handle's left.
  const clipPath = useTransform(x, (value) => {
    if (width <= 0) return "inset(0 50% 0 0)";
    const ratio = Math.min(Math.max((value + width / 2) / width, 0), 1);
    return `inset(0 ${(1 - ratio) * 100}% 0 0)`;
  });

  // Dragging owns the handle; `percent` mirrors it for assistive tech.
  const percentRef = useRef(50);
  useMotionValueEvent(x, "change", (value) => {
    if (width <= 0) return;
    const next = Math.round(Math.min(Math.max((value + width / 2) / width, 0), 1) * 100);
    percentRef.current = next;
    setPercent(next);
  });

  useLayoutEffect(() => {
    const sync = () => {
      const next = stageRef.current?.clientWidth ?? 0;
      setWidth(next);
      // Keep the handle at the same ratio across resizes.
      x.set((percentRef.current / 100 - 0.5) * next);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [x]);

  const nudge = (deltaRatio: number) => {
    const next = Math.min(Math.max(percentRef.current / 100 + deltaRatio, 0), 1);
    percentRef.current = Math.round(next * 100);
    setPercent(percentRef.current);
    x.set((next - 0.5) * width);
  };

  const moveTo = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const ratio = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
    x.set((ratio - 0.5) * bounds.width);
  };

  // The whole stage is the grab area: a finger lands anywhere and the curtain follows it, so the
  // gesture never depends on hitting the thin handle. Vertical pans still scroll the page.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    heldRef.current = true;
    setIsHeld(true);
    moveTo(event.clientX);
    // Capture keeps the drag alive when the finger leaves the stage; a pointer the browser no
    // longer tracks cannot be captured, and the tap alone still moves the curtain.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not capturable; the drag simply ends at the stage edge.
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (heldRef.current) moveTo(event.clientX);
  };

  const release = () => {
    heldRef.current = false;
    setIsHeld(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-KEYBOARD_STEP_RATIO);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(KEYBOARD_STEP_RATIO);
    }
  };

  return (
    <section
      className={styles.section}
      aria-labelledby="compare-title"
      data-testid="compare-slider"
    >
      <div className={styles.head}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id="compare-title" className={styles.title}>
          {title}
        </h2>
      </div>

      <div
        className={styles.stage}
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className={styles.layer} aria-hidden="true">
          <HomeImage src={right.image.src} alt={right.image.alt} sizes="100vw" />
        </div>
        <m.div className={styles.layer} style={{ clipPath }} aria-hidden="true">
          <HomeImage src={left.image.src} alt={left.image.alt} sizes="100vw" />
        </m.div>

        <m.div
          className={styles.handle}
          style={{ x }}
          initial="idle"
          animate={isHeld ? "held" : "idle"}
          role="slider"
          tabIndex={0}
          aria-label={`Comparar ${left.name} y ${right.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% ${left.name}`}
          onKeyDown={handleKeyDown}
          data-testid="compare-slider-handle"
        >
          <m.span
            className={styles.handleLine}
            variants={HANDLE_LINE_VARIANTS}
            aria-hidden="true"
          />
          <m.span className={styles.handleGrip} variants={HANDLE_GRIP_VARIANTS}>
            <Icon icon={GripVertical} size="sm" aria-hidden="true" />
          </m.span>
        </m.div>

        <div className={`${styles.caption} ${styles.captionLeft}`}>
          <span className={styles.captionKicker}>{left.kicker}</span>
          <span className={styles.captionName}>{left.name}</span>
        </div>
        <div className={`${styles.caption} ${styles.captionRight}`}>
          <span className={styles.captionKicker}>{right.kicker}</span>
          <span className={styles.captionName}>{right.name}</span>
        </div>
      </div>
    </section>
  );
}
