import React from "react";
import type { CohortFinancialsResult } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import { MonetaryTrendBadge, CountTrendBadge } from "./trend-badge";
import { DollarSign, AlertTriangle, HelpCircle } from "lucide-react";
import styles from "./financial-cohort-section.module.css";

interface FinancialCohortSectionProps {
  financialCohort: CohortFinancialsResult;
}

export function FinancialCohortSection({ financialCohort }: FinancialCohortSectionProps) {
  if (financialCohort.status === "UNAUTHORIZED") {
    return null;
  }

  if (financialCohort.status === "UNAVAILABLE") {
    return (
      <section className={styles.section} aria-labelledby="financial-heading">
        <div className={styles.sectionHeader}>
          <div className={styles.titleWrapper}>
            <DollarSign className={styles.sectionIcon} aria-hidden="true" />
            <h2 id="financial-heading" className={styles.sectionTitle}>
              Resumen Financiero
            </h2>
          </div>
        </div>

        <div className={styles.anomalyCard} role="alert">
          <AlertTriangle className={styles.anomalyIcon} aria-hidden="true" />
          <div className={styles.anomalyContent}>
            <h3 className={styles.anomalyTitle}>Métricas financieras no disponibles</h3>
            <p className={styles.anomalyText}>
              No se pueden mostrar las métricas financieras en este momento porque se detectó una
              inconsistencia de moneda.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { current, trends } = financialCohort.data;

  return (
    <section className={styles.section} aria-labelledby="financial-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.titleWrapper}>
          <DollarSign className={styles.sectionIcon} aria-hidden="true" />
          <h2 id="financial-heading" className={styles.sectionTitle}>
            Resumen Financiero
          </h2>
        </div>
        <p className={styles.sectionCaption}>
          <HelpCircle className={styles.captionIcon} aria-hidden="true" />
          Pedidos creados en el período seleccionado, según su estado de pago actual.
        </p>
      </div>

      <div className={styles.kpiGrid}>
        {/* KPI 1: Valor neto de pedidos */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Valor neto de pedidos</span>
            <MonetaryTrendBadge
              trend={trends.net}
              comparisonLabel="Comparación vs período anterior"
            />
          </div>
          <div className={styles.kpiValue} data-testid="kpi-net-cents">
            {formatCentsToPen(current.cohortNetCents)}
          </div>
          <div className={styles.kpiFooter}>Neto realizado después de devoluciones</div>
        </div>

        {/* KPI 2: Valor bruto confirmado */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Valor bruto confirmado</span>
            <MonetaryTrendBadge
              trend={trends.gross}
              comparisonLabel="Comparación vs período anterior"
            />
          </div>
          <div className={styles.kpiValue} data-testid="kpi-gross-cents">
            {formatCentsToPen(current.cohortGrossCents)}
          </div>
          <div className={styles.kpiFooter}>Bruto total de pedidos con pago confirmado</div>
        </div>

        {/* KPI 3: Pedidos pagados */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Pedidos pagados</span>
            <CountTrendBadge
              trend={trends.paidOrders}
              comparisonLabel="Comparación vs período anterior"
            />
          </div>
          <div className={styles.kpiValue} data-testid="kpi-paid-orders">
            {formatInteger(current.cohortPaidOrders)}
          </div>
          <div className={styles.kpiFooter}>
            {current.cohortActivePaidOrders} pedidos pagados activos
          </div>
        </div>

        {/* KPI 4: Ticket promedio */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Ticket promedio</span>
            <MonetaryTrendBadge
              trend={trends.aov}
              comparisonLabel="Comparación vs período anterior"
            />
          </div>
          <div className={styles.kpiValue} data-testid="kpi-aov-cents">
            {formatCentsToPen(current.aovCents)}
          </div>
          <div className={styles.kpiFooter}>Valor neto por pedido pagado activo</div>
        </div>
      </div>
    </section>
  );
}
