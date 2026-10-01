"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cookie } from "lucide-react";
import { DomeButton } from "@/components/ui";
import styles from "./cookie-consent.module.css";

const STORAGE_KEY = "gp-cookie-notice";
const NOTICE_VERSION = "2026-10-01";
const SHOW_AFTER_MS = 2500;

function hasAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === NOTICE_VERSION;
  } catch {
    return false;
  }
}

/**
 * Cookie notice. The store sets only strictly necessary cookies, so this informs rather than
 * asks for consent to optional tracking; acknowledging it is remembered per notice version.
 * It slides up from the bottom a moment after the page loads, so it never competes with the
 * first paint.
 */
export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (hasAcknowledged()) return;
    const timer = window.setTimeout(() => setIsVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const acknowledge = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, NOTICE_VERSION);
    } catch {
      // Without storage the notice simply shows again next visit.
    }
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.section
          className={styles.banner}
          role="region"
          aria-label="Aviso de cookies"
          initial={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          <span className={styles.icon} aria-hidden="true">
            <Cookie size={20} />
          </span>
          <p className={styles.text}>
            Usamos solo cookies necesarias para mantener tu sesión y tu carrito. No usamos cookies
            de publicidad.{" "}
            <Link href="/legal/cookies" className={styles.link}>
              Política de cookies
            </Link>
          </p>
          <DomeButton tone="dark" className={styles.accept} onClick={acknowledge}>
            Entendido
          </DomeButton>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
