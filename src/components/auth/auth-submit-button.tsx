"use client";

import React from "react";
import { motion, type Variants } from "framer-motion";
import styles from "./auth.module.css";

interface AuthSubmitButtonProps {
  disabled?: boolean;
  /** Stagger item variants when the form animates its children in. */
  variants?: Variants;
  children: React.ReactNode;
}

export function AuthSubmitButton({ disabled = false, variants, children }: AuthSubmitButtonProps) {
  return (
    <motion.button
      type="submit"
      variants={variants}
      disabled={disabled}
      className={styles.primaryButton}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
    >
      {children}
    </motion.button>
  );
}
