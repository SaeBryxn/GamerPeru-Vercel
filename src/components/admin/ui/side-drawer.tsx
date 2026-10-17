"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./side-drawer.module.css";

const EASE = [0.25, 0.1, 0.25, 1] as const;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SideDrawerProps {
  labelledBy: string;
  onClose: () => void;
  /** While true, Escape and the scrim do not close the drawer. */
  busy?: boolean;
  size?: "default" | "wide";
  testId?: string;
  children: React.ReactNode;
}

/**
 * Right-hand dialog panel for admin tasks. Render it inside AnimatePresence to get the exit.
 *
 * Portaled to <body>: the admin shell animates each page with a transform, which would turn a
 * fixed overlay into one positioned inside the page and layered under its content.
 */
export function SideDrawer({
  labelledBy,
  onClose,
  busy = false,
  size = "default",
  testId,
  children,
}: SideDrawerProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // Read through refs so the mount effect never re-runs: re-running it would pull focus back to
  // the panel every time the caller's busy state or callback identity changes.
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className={styles.root}>
      <motion.div
        className={styles.scrim}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />
      <motion.div
        ref={panelRef}
        className={`${styles.panel} ${size === "wide" ? styles.panelWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        initial={{ x: reduceMotion ? 0 : "6%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: reduceMotion ? 0 : "4%", opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
        data-testid={testId}
      >
        {children}
      </motion.div>
    </div>,
    document.body
  );
}

export function DrawerHeader({
  titleId,
  title,
  eyebrow,
  onClose,
  busy = false,
}: {
  titleId: string;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div className={styles.header}>
      <div>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </div>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        disabled={busy}
        aria-label="Cerrar panel"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
