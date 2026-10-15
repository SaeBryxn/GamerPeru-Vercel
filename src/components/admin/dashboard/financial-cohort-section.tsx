import React from "react";
import { AlertTriangle } from "lucide-react";
import type { CohortFinancialsResult } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricRow, MetricWidget, StaggerItem } from "../ui";
import { MonetaryTrendBadge, CountTrendBadge } from "./trend-badge";
import styles from "./financial-cohort-section.module.css";

interface FinancialCohortSectionProps {
  financialCohort: CohortFinancialsResult;
  /** Paid orders of the period in the orders list. */
  paidOrdersHref?: string;
}

const COMPARISON = "Comparación vs período anterior";

export function FinancialCohortSection({
  financialCohort,
  paidOrdersHref,
}: FinancialCohortSectionProps) {
  if (financialCohort.status === "UNAUTHORIZED") {
    return null;
  }

  if (financialCohort.status === "UNAVAILABLE") {
    return (
      <AdminSection id="financial-heading" title="Resumen Financiero">
        <StaggerItem>
          <AdminCard padded className={styles.anomaly} role="alert">
            <AlertTriangle className={styles.anomalyIcon} aria-hidden="true" />
            <div>
              <h3 className={styles.anomalyTitle}>Métricas financieras no disponibles</h3>
              <p className={styles.anomalyText}>
                No se pueden mostrar las métricas financieras en este momento porque se detectó una
                inconsistencia de moneda.
              </p>
            </div>
          </AdminCard>
        </StaggerItem>
      </AdminSection>
    );
  }

  const { current, trends } = financialCohort.data;

  return (
    <AdminSection
      id="financial-heading"
      title="Resumen Financiero"
      caption="Pedidos creados en el período seleccionado, según su estado de pago actual."
    >
      <AdminCard>
        <MetricRow>
          <StaggerItem>
            <MetricWidget
              label="Valor neto de pedidos"
              value={formatCentsToPen(current.cohortNetCents)}
              valueTestId="kpi-net-cents"
              href={paidOrdersHref}
              trend={<MonetaryTrendBadge trend={trends.net} comparisonLabel={COMPARISON} />}
              footnote="Neto realizado después de devoluciones"
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Valor bruto confirmado"
              value={formatCentsToPen(current.cohortGrossCents)}
              valueTestId="kpi-gross-cents"
              href={paidOrdersHref}
              trend={<MonetaryTrendBadge trend={trends.gross} comparisonLabel={COMPARISON} />}
              footnote="Bruto total de pedidos con pago confirmado"
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Pedidos pagados"
              value={formatInteger(current.cohortPaidOrders)}
              valueTestId="kpi-paid-orders"
              href={paidOrdersHref}
              trend={<CountTrendBadge trend={trends.paidOrders} comparisonLabel={COMPARISON} />}
              footnote={`${current.cohortActivePaidOrders} pedidos pagados activos`}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Ticket promedio"
              value={formatCentsToPen(current.aovCents)}
              valueTestId="kpi-aov-cents"
              href={paidOrdersHref}
              trend={<MonetaryTrendBadge trend={trends.aov} comparisonLabel={COMPARISON} />}
              footnote="Valor neto por pedido pagado activo"
            />
          </StaggerItem>
        </MetricRow>
      </AdminCard>
    </AdminSection>
  );
}
