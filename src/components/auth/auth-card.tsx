"use client";

import React from "react";
import Link from "@/components/app-link";
import { MotionConfig, motion } from "framer-motion";
import { AUTH_CARD_VARIANTS } from "./auth-motion";
import styles from "./auth.module.css";

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Full-screen auth canvas: no card, just a centered column on the page background. Auth routes
 * sit outside the storefront layout, so the wordmark is the way back to the store.
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className={styles.pageContainer}>
      <MotionConfig reducedMotion="user">
        <motion.div
          className={styles.authColumn}
          variants={AUTH_CARD_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          <Link href="/" className={styles.wordmark}>
            Gamer Perú<span className={styles.wordmarkDot}>.</span>
          </Link>

          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </header>

          {children}

          {footer ? <div className={styles.footerLinks}>{footer}</div> : null}
        </motion.div>
      </MotionConfig>
    </main>
  );
}
