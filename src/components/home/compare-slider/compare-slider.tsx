"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { GripVertical } from "lucide-react";
import { Icon } from "@/components/ui";
import { HomeImage } from "../home-image";
import styles from "./compare-slider.module.css";

const KEYBOARD_STEP_RATIO = 0.05;

export interface CompareSide {
  /** Small line above the name. */
  kicker: string;
  name: string;
  image: { src: string; alt: string };
}

export interface CompareSliderProps {
  eyebrow: string;
  title: string;
  left: CompareSide;
  right: CompareSide;
}

/**
 * Curtain comparison: dragging the handle moves a clip over the left image,
 * revealing the right one underneath. The handle is also a slider for keyboard
 * users, so the comparison never depends on pointer dragging.
 */
export function CompareSlider({ eyebrow, title, left, right }: CompareSliderProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const [percent, setPercent] = useState(50);

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

      <div className={styles.stage} ref={stageRef}>
        <div className={styles.layer} aria-hidden="true">
          <HomeImage src={right.image.src} alt={right.image.alt} sizes="100vw" />
        </div>
        <motion.div className={styles.layer} style={{ clipPath }} aria-hidden="true">
          <HomeImage src={left.image.src} alt={left.image.alt} sizes="100vw" />
        </motion.div>

        <motion.div
          className={styles.handle}
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -width / 2, right: width / 2 }}
          dragElastic={0}
          dragMomentum={false}
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
          <span className={styles.handleLine} aria-hidden="true" />
          <span className={styles.handleGrip}>
            <Icon icon={GripVertical} size="sm" aria-hidden="true" />
          </span>
        </motion.div>

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
