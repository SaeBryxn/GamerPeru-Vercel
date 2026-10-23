import React from "react";
import Link from "@/components/app-link";
import type { DashboardPeriodSelector } from "@/lib/admin/dashboard-period";
import styles from "./dashboard-header.module.css";
import { DashboardRefresh } from "./dashboard-refresh";

interface DashboardHeaderProps {
  selectedPeriod: DashboardPeriodSelector;
  showPeriodSelector?: boolean;
  updatedAt?: string;
  /** "Comparado con ayer, 22 oct." — what every trend on the page is measured against. */
  comparison?: string;
}

export const PERIOD_OPTIONS: Array<{ id: DashboardPeriodSelector; label: string }> = [
  { id: "TODAY", label: "Hoy" },
  { id: "LAST_7_DAYS", label: "7 días" },
  { id: "LAST_30_DAYS", label: "30 días" },
  { id: "THIS_MONTH", label: "Este mes" },
];

export function PeriodSelector({ selectedPeriod }: { selectedPeriod: DashboardPeriodSelector }) {
  return (
    <nav className={styles.periodNav} aria-label="Seleccionar período de reporte">
      {PERIOD_OPTIONS.map((option) => {
        const isActive = selectedPeriod === option.id;
        return (
          <Link
            key={option.id}
            href={`/admin?period=${option.id}`}
            className={`${styles.periodBtn} ${isActive ? styles.periodBtnActive : ""}`}
            aria-current={isActive ? "page" : undefined}
            scroll={false}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardHeader({
  selectedPeriod,
  showPeriodSelector = true,
  updatedAt,
  comparison,
}: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>Inicio</h1>
        <p className={styles.meta}>
          {updatedAt && (
            <time dateTime={updatedAt}>
              Actualizado{" "}
              {new Date(updatedAt).toLocaleString("es-PE", {
                timeZone: "America/Lima",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
          {updatedAt && comparison && showPeriodSelector && <span aria-hidden="true"> · </span>}
          {comparison && showPeriodSelector && <span>{comparison}</span>}
        </p>
      </div>

      <div className={styles.controls}>
        {showPeriodSelector && <PeriodSelector selectedPeriod={selectedPeriod} />}
        <DashboardRefresh />
      </div>
    </header>
  );
}
