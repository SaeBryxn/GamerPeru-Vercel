import React from "react";
import Link from "next/link";
import type { DashboardPeriodSelector } from "@/lib/admin/dashboard-period";
import { ShieldCheck, Calendar } from "lucide-react";
import styles from "./dashboard-header.module.css";

interface DashboardHeaderProps {
  selectedPeriod: DashboardPeriodSelector;
  actorEmail: string | null;
  actorRoles: string[];
}

const PERIOD_OPTIONS: Array<{ id: DashboardPeriodSelector; label: string }> = [
  { id: "TODAY", label: "Hoy" },
  { id: "LAST_7_DAYS", label: "7 días" },
  { id: "LAST_30_DAYS", label: "30 días" },
  { id: "THIS_MONTH", label: "Este mes" },
];

export function DashboardHeader({ selectedPeriod, actorEmail, actorRoles }: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.title}>Resumen</h1>
          <p className={styles.subtitle}>
            Métricas comerciales, pedidos, pagos e inventario de Gamer Perú.
          </p>
        </div>

        <div className={styles.userBanner}>
          <ShieldCheck className={styles.bannerIcon} aria-hidden="true" />
          <div className={styles.bannerDetails}>
            <div className={styles.bannerEmail}>{actorEmail ?? "Personal Autorizado"}</div>
            <div className={styles.bannerRoles}>
              {actorRoles.map((role) => (
                <span key={role} className={styles.roleTag}>
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.controlsRow}>
        <div
          className={styles.periodGroup}
          role="group"
          aria-label="Seleccionar período de reporte"
        >
          <span className={styles.periodLabel}>
            <Calendar className={styles.periodIcon} aria-hidden="true" />
            <span>Período:</span>
          </span>
          <nav className={styles.periodNav} aria-label="Filtros de período">
            {PERIOD_OPTIONS.map((option) => {
              const isActive = selectedPeriod === option.id;
              return (
                <Link
                  key={option.id}
                  href={`/admin?period=${option.id}`}
                  className={`${styles.periodBtn} ${isActive ? styles.periodBtnActive : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={styles.refreshNote} aria-live="polite">
          Datos actualizados al cargar esta página
        </div>
      </div>
    </header>
  );
}
