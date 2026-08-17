import React from "react";
import styles from "./product-card.module.css";

/**
 * Product Card Abstract Media Fallback
 *
 * Renders a premium geometric abstract hardware stage when primary_media_id is null
 * or pending owner render.
 *
 * Invariant:
 * 1. Preserves 4:5 vertical proportion.
 * 2. aria-hidden="true" (decorative).
 * 3. Does not contain proprietary third-party product artwork.
 */
export function ProductCardFallback(): React.JSX.Element {
  return (
    <div className={styles.fallbackStage} aria-hidden="true">
      <svg
        className={styles.fallbackIcon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="12"
          y="8"
          width="40"
          height="48"
          rx="6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M32 20V32M32 32L38 26M32 32L26 26"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="44" r="2" fill="currentColor" />
      </svg>
      <span className={styles.fallbackLabel}>Gamer Perú</span>
    </div>
  );
}
