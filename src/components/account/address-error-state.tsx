"use client";

import React from "react";
import { useRouter } from "next/navigation";
import styles from "./address.module.css";

export function AddressErrorState() {
  const router = useRouter();

  return (
    <div>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Direcciones de entrega</h1>
      </div>

      <div className={styles.errorState} role="alert">
        <div className={styles.errorIcon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className={styles.errorTitle}>No pudimos cargar tus direcciones</h2>
        <p className={styles.errorDesc}>
          Ocurrió un problema al consultar tu libreta de direcciones. Por favor, intenta nuevamente.
        </p>
        <button type="button" className={styles.retryButton} onClick={() => router.refresh()}>
          Intentar nuevamente
        </button>
      </div>
    </div>
  );
}
