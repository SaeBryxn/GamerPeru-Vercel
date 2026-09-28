"use client";

import React from "react";
import { MotionConfig, motion } from "framer-motion";
import { AUTH_CARD_VARIANTS } from "./auth-motion";
import styles from "./auth.module.css";

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className={styles.pageContainer}>
      <MotionConfig reducedMotion="user">
        <motion.div
          className={styles.authCard}
          variants={AUTH_CARD_VARIANTS}
          initial="hidden"
          animate="visible"
        >
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
