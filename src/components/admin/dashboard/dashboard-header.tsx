import React from "react";
import Link from "next/link";
import type { DashboardPeriodSelector } from "@/lib/admin/dashboard-period";
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
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>Resumen</h1>
        <p className={styles.subtitle}>
          Métricas comerciales, pedidos, pagos e inventario de Gamer Perú.
        </p>
        <p className={styles.session}>
          {actorEmail ?? "Personal Autorizado"}
          {actorRoles.length > 0 ? ` · ${actorRoles.join(", ")}` : ""}
          {" · "}Datos actualizados al cargar esta página
        </p>
      </div>

      <div className={styles.periodNav} role="group" aria-label="Seleccionar período de reporte">
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
      </div>
    </header>
  );
}
