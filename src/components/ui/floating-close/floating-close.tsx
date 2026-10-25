"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  m,
  useMotionValue,
  useSpring,
  type MotionValue,
  type Transition,
} from "framer-motion";
import { X } from "lucide-react";
import { Icon } from "../icon";
import styles from "./floating-close.module.css";

const FOLLOW_SPRING = { stiffness: 700, damping: 45, mass: 0.35 } as const;
const FADE: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

export interface FloatingCloseState {
  isVisible: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Spread onto the dismissable surface (backdrop/overlay). */
  targetProps: {
    className: string;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
  };
  hide: () => void;
}

/** Tracks the mouse over a dismissable surface so a close button can trail the cursor there. */
export function useFloatingClose(): FloatingCloseState {
  const [isVisible, setIsVisible] = useState(false);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, FOLLOW_SPRING);
  const y = useSpring(pointerY, FOLLOW_SPRING);

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    if (!isVisible) {
      // Jump instead of springing in from the last position on first appearance.
      pointerX.jump(e.clientX);
      pointerY.jump(e.clientY);
      x.jump(e.clientX);
      y.jump(e.clientY);
      setIsVisible(true);
      return;
    }
    pointerX.set(e.clientX);
    pointerY.set(e.clientY);
  };

  const hide = () => setIsVisible(false);

  return {
    isVisible,
    x,
    y,
    targetProps: { className: styles.hideCursor ?? "", onPointerMove, onPointerLeave: hide },
    hide,
  };
}

export interface FloatingCloseProps {
  state: FloatingCloseState;
  /** Whether the dismissable surface is currently shown. */
  active: boolean;
  /**
   * Render into document.body. Needed when an ancestor (e.g. one with backdrop-filter) would
   * become the containing block for position: fixed; leave off inside a modal dialog, which
   * sits in the top layer above body.
   */
  portal?: boolean;
  "data-testid"?: string;
}

/**
 * Decorative close affordance: clicks pass through to the surface underneath, which does the
 * closing. Keyboard and screen reader users rely on the surface's own close control.
 */
export function FloatingClose({
  state,
  active,
  portal = false,
  "data-testid": testId,
}: FloatingCloseProps) {
  const content = (
    <AnimatePresence>
      {active && state.isVisible && (
        <m.div
          key="floating-close"
          className={styles.floatingClose}
          style={{ x: state.x, y: state.y }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, transition: FADE }}
          exit={{ opacity: 0, scale: 0.6, transition: FADE }}
          aria-hidden="true"
          data-testid={testId}
        >
          <Icon icon={X} size="lg" />
        </m.div>
      )}
    </AnimatePresence>
  );

  return portal && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
