"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "./admin-shell.module.css";

interface AdminErrorProps {
  error?: Error;
  reset?: () => void;
  /**
   * "authorization": the staff context could not be resolved, so access is blocked.
   * "load": the screen itself failed (typically a slow or failed query), access is not in doubt.
   */
  reason?: "authorization" | "load";
}

const COPY = {
  authorization: {
    title: "Servicio no disponible",
    description:
      "No se pudo verificar tu autorización en este momento. Por seguridad, el acceso ha sido bloqueado.",
  },
  load: {
    title: "No pudimos cargar esta sección",
    description:
      "Hubo un problema temporal al consultar los datos. Vuelve a intentarlo en unos segundos.",
  },
} as const;

export function AdminError({ reset, reason = "authorization" }: AdminErrorProps) {
  const copy = COPY[reason];
  return (
    <div className={styles.shell}>
      <div className={styles.stateCard}>
        <AlertTriangle className={styles.stateIcon} aria-hidden="true" />
        <h1 className={styles.stateTitle}>{copy.title}</h1>
        <p className={styles.stateDescription}>{copy.description}</p>
        <div className={styles.stateActions}>
          {reset ? (
            <button
              type="button"
              onClick={() => reset()}
              className={`${styles.actionButton} ${styles.primaryAction}`}
            >
              <RefreshCw
                className={styles.navIcon}
                aria-hidden="true"
                style={{ marginRight: "0.5rem" }}
              />
              Reintentar
            </button>
          ) : (
            <Link href="/admin" className={`${styles.actionButton} ${styles.primaryAction}`}>
              <RefreshCw
                className={styles.navIcon}
                aria-hidden="true"
                style={{ marginRight: "0.5rem" }}
              />
              Reintentar
            </Link>
          )}
          <Link href="/" className={`${styles.actionButton} ${styles.secondaryAction}`}>
            Ir a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
