import React from "react";
import Link from "next/link";
import type { DashboardPeriodSelector } from "@/lib/admin/dashboard-period";
import styles from "./dashboard-header.module.css";
import { DashboardRefresh } from "./dashboard-refresh";

interface DashboardHeaderProps {
  selectedPeriod: DashboardPeriodSelector;
  /** Leave the selector out when the page places it next to the metrics it drives. */
  showPeriodSelector?: boolean;
  /** Controls shown at the right of the title, such as the view switcher. */
  aside?: React.ReactNode;
  view?: "operations" | "metrics";
  updatedAt?: string;
}

const PERIOD_OPTIONS: Array<{ id: DashboardPeriodSelector; label: string }> = [
  { id: "TODAY", label: "Hoy" },
  { id: "LAST_7_DAYS", label: "7 días" },
  { id: "LAST_30_DAYS", label: "30 días" },
  { id: "THIS_MONTH", label: "Este mes" },
];

export function PeriodSelector({ selectedPeriod }: { selectedPeriod: DashboardPeriodSelector }) {
  return (
    <div className={styles.periodNav} role="group" aria-label="Seleccionar período de reporte">
      {PERIOD_OPTIONS.map((option) => {
        const isActive = selectedPeriod === option.id;
        return (
          <Link
            key={option.id}
            href={`/admin?vista=metricas&period=${option.id}`}
            className={`${styles.periodBtn} ${isActive ? styles.periodBtnActive : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardHeader({
  selectedPeriod,
  showPeriodSelector = true,
  aside,
  view = "operations",
  updatedAt,
}: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <span className={styles.eyebrow}>Gamer Perú · Administración</span>
        <h1 className={styles.title}>
          {view === "metrics" ? "Métricas de la tienda" : "Centro de operaciones"}
        </h1>
        <p className={styles.subtitle}>
          {view === "metrics"
            ? "Resultados del período y su comparación"
            : "Pagos, preparación y catálogo: cada pendiente tiene su siguiente paso"}
        </p>
        {updatedAt && (
          <time className={styles.updated} dateTime={updatedAt}>
            Actualizado{" "}
            {new Date(updatedAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · hora de Lima
          </time>
        )}
      </div>

      <DashboardRefresh />
      {aside && <div className={styles.views}>{aside}</div>}
      {showPeriodSelector && <PeriodSelector selectedPeriod={selectedPeriod} />}
    </header>
  );
}
