"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "./admin-shell.module.css";

interface AdminErrorProps {
  error?: Error;
  reset?: () => void;
}

export function AdminError({ error, reset }: AdminErrorProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.stateCard}>
        <AlertTriangle className={styles.stateIcon} aria-hidden="true" />
        <h1 className={styles.stateTitle}>Servicio no disponible</h1>
        <p className={styles.stateDescription}>
          No se pudo verificar tu autorización en este momento debido a un problema de conexión con
          el servicio de base de datos. Por seguridad, el acceso ha sido bloqueado.
          {error?.message ? ` (${error.message})` : ""}
        </p>
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
          ) : null}
          <Link href="/" className={`${styles.actionButton} ${styles.secondaryAction}`}>
            Ir a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
