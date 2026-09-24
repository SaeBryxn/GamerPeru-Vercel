"use client";

import React from "react";
import { motion } from "framer-motion";
import styles from "./filter-drawer.module.css";

export interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  testId?: string;
}

/**
 * A native checkbox exposed as role="switch" (keyboard, forms and automation
 * keep working), with a visual track whose knob springs across.
 */
export function ToggleSwitch({ label, checked, onChange, testId }: ToggleSwitchProps) {
  return (
    <label className={styles.toggle}>
      <span className={styles.toggleLabel}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className={styles.toggleInput}
        checked={checked}
        onChange={onChange}
        data-testid={testId}
      />
      <motion.span
        className={styles.toggleTrack}
        initial={false}
        animate={{
          backgroundColor: checked
            ? "var(--color-surface-dark-canvas)"
            : "var(--color-surface-tertiary)",
        }}
        transition={{ duration: 0.3 }}
        aria-hidden="true"
      >
        <motion.span
          className={styles.toggleKnob}
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </motion.span>
    </label>
  );
}
