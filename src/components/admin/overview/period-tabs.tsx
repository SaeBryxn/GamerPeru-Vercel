import React from "react";
import Link from "@/components/app-link";
import type { DashboardPeriodSelector } from "@/lib/admin/dashboard-period";
import styles from "./period-controls.module.css";

export const PERIOD_OPTIONS: Array<{ id: DashboardPeriodSelector; label: string }> = [
  { id: "TODAY", label: "Hoy" },
  { id: "LAST_7_DAYS", label: "7 días" },
  { id: "LAST_30_DAYS", label: "30 días" },
  { id: "THIS_MONTH", label: "Este mes" },
];

/** Segmented links: the period lives in the URL, so it survives a reload and can be shared. */
export function PeriodTabs({ selected }: { selected: DashboardPeriodSelector }) {
  return (
    <nav className={styles.tabs} aria-label="Período del resumen">
      {PERIOD_OPTIONS.map((option) => {
        const active = option.id === selected;
        return (
          <Link
            key={option.id}
            href={option.id === "TODAY" ? "/admin" : `/admin?period=${option.id}`}
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            aria-current={active ? "page" : undefined}
            scroll={false}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
