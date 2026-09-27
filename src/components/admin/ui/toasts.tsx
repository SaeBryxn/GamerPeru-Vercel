"use client";

import React, { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleAlert, CircleCheck } from "lucide-react";
import styles from "./toasts.module.css";

export type ToastTone = "success" | "error";
export type NotifyFn = (tone: ToastTone, message: string) => void;

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const VISIBLE_MS = 5000;

/** At most three toasts at once, each gone after five seconds. */
export function useToasts(): { toasts: Toast[]; notify: NotifyFn } {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<NotifyFn>((tone, message) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, VISIBLE_MS);
  }, []);

  return { toasts, notify };
}

export function ToastViewport({ toasts }: { toasts: Toast[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={styles.viewport} aria-live="polite" aria-atomic="false">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`${styles.toast} ${toast.tone === "error" ? styles.error : ""}`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {toast.tone === "error" ? (
              <CircleAlert size={16} aria-hidden="true" />
            ) : (
              <CircleCheck size={16} aria-hidden="true" />
            )}
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
