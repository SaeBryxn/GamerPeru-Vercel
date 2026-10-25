"use client";

import React, { useId } from "react";
import { m } from "framer-motion";
import { Star } from "lucide-react";
import styles from "./featured-toggle.module.css";

interface FeaturedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * A native checkbox exposed as role="switch", so forms, keyboard and automation keep
 * working while the track and knob carry the visual state.
 */
export function FeaturedToggle({ checked, onChange, disabled }: FeaturedToggleProps) {
  const descriptionId = useId();

  return (
    <label className={`${styles.card} ${checked ? styles.cardOn : ""}`}>
      <m.span
        className={styles.icon}
        initial={false}
        animate={{ rotate: checked ? 72 : 0, scale: checked ? 1.05 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        aria-hidden="true"
      >
        <Star size={16} fill={checked ? "currentColor" : "none"} />
      </m.span>
      <span className={styles.copy}>
        <span className={styles.title}>Producto destacado</span>
        <span id={descriptionId} className={styles.description}>
          Aparece en las secciones destacadas de la tienda.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label="Marcar como producto destacado en la tienda"
        aria-describedby={descriptionId}
        data-testid="input-featured"
      />
      <span className={styles.track} aria-hidden="true">
        <m.span
          className={styles.knob}
          initial={false}
          animate={{ x: checked ? 16 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
        />
      </span>
    </label>
  );
}
