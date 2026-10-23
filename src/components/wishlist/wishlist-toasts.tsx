"use client";

import React, { useEffect, useRef } from "react";
import Link from "@/components/app-link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleAlert, Heart, LogIn } from "lucide-react";
import styles from "./wishlist-toasts.module.css";

export interface WishlistToast {
  id: number;
  tone: "success" | "info" | "error";
  message: string;
  action?: { label: string; href: string };
}

/**
 * Rendered as a manual popover so it sits in the top layer: hearts also live inside the quick
 * view's modal dialog, and anything outside the top layer would be painted underneath it. The
 * popover is re-shown on each new toast to stack above whatever opened since.
 */
export function WishlistToasts({ toasts }: { toasts: WishlistToast[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const latestId = toasts.at(-1)?.id;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof viewport.showPopover !== "function") return;
    if (viewport.matches(":popover-open")) viewport.hidePopover();
    if (latestId !== undefined) viewport.showPopover();
  }, [latestId]);

  return (
    <div ref={viewportRef} popover="manual" className={styles.viewport} aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={styles.toast}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 8, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 460, damping: 32 }}
          >
            <span className={styles.icon} data-tone={toast.tone} aria-hidden="true">
              {toast.tone === "error" ? (
                <CircleAlert size={16} />
              ) : toast.tone === "info" ? (
                <LogIn size={16} />
              ) : (
                <Heart size={16} fill="currentColor" />
              )}
            </span>
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <Link href={toast.action.href} className={styles.action}>
                {toast.action.label}
              </Link>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
