import React from "react";
import Link from "@/components/app-link";
import { ShieldAlert } from "lucide-react";
import styles from "./admin-shell.module.css";

interface AdminForbiddenProps {
  email?: string | null;
}

export function AdminForbidden({ email }: AdminForbiddenProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.stateCard}>
        <ShieldAlert className={styles.stateIcon} aria-hidden="true" />
        <h1 className={styles.stateTitle}>Acceso no autorizado</h1>
        <p className={styles.stateDescription}>
          Tu cuenta {email ? `(${email})` : ""} está autenticada pero no cuenta con roles ni
          permisos de personal para acceder al panel de administración de Gamer Perú.
        </p>
        <div className={styles.stateActions}>
          <Link href="/cuenta" className={`${styles.actionButton} ${styles.primaryAction}`}>
            Ir a mi cuenta
          </Link>
          <Link href="/" className={`${styles.actionButton} ${styles.secondaryAction}`}>
            Ir a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
