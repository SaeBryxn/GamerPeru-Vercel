"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { animate, useMotionValue, type MotionValue, type PanInfo } from "framer-motion";

const SNAP_SPRING = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 } as const;
// How much of the fling carries into the snap decision.
const VELOCITY_WEIGHT = 0.18;

export interface DragRail {
  viewportRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLUListElement | null>;
  x: MotionValue<number>;
  maxOffset: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  onDragEnd: (event: unknown, info: PanInfo) => void;
}

/**
 * Horizontal rail shared by the home carousels: drag or fling it and it snaps
 * to the nearest card; the arrows step one card at a time. Card pitch and
 * travel are measured from layout, so any card width works.
 */
export function useDragRail(): DragRail {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const x = useMotionValue(0);

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    const first = track?.firstElementChild as HTMLElement | undefined;
    if (!track || !viewport || !first) return;

    const gap = Number.parseFloat(getComputedStyle(track).columnGap || "0") || 0;
    setStep(first.offsetWidth + gap);
    setMaxOffset(Math.max(0, track.scrollWidth - viewport.clientWidth));
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const maxIndex = step > 0 ? Math.ceil(maxOffset / step) : 0;
  const clampedIndex = Math.min(index, maxIndex);
  const targetX = step > 0 ? -Math.min(clampedIndex * step, maxOffset) : 0;

  useEffect(() => {
    const controls = animate(x, targetX, SNAP_SPRING);
    return () => controls.stop();
  }, [targetX, x]);

  return {
    viewportRef,
    trackRef,
    x,
    maxOffset,
    canGoBack: clampedIndex > 0,
    canGoForward: clampedIndex < maxIndex,
    goBack: () => setIndex(Math.max(0, clampedIndex - 1)),
    goForward: () => setIndex(Math.min(maxIndex, clampedIndex + 1)),
    onDragEnd: (_event, info) => {
      if (step <= 0) return;
      const projected = -x.get() - info.velocity.x * VELOCITY_WEIGHT;
      setIndex(Math.max(0, Math.min(Math.round(projected / step), maxIndex)));
    },
  };
}
