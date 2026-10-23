import React from "react";
import { AlertTriangle, Moon } from "lucide-react";
import type { CohortFinancialsResult, PaymentVerificationData } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, EmptyState, MetricRow, MetricWidget, StaggerItem } from "../ui";
import { MonetaryTrendBadge, CountTrendBadge } from "./trend-badge";
import styles from "./financial-cohort-section.module.css";
import { AnimatedCounter } from "./animated-counter";

interface FinancialCohortSectionProps {
  financialCohort: CohortFinancialsResult;
  /** Paid orders of the period in the orders list. */
  paidOrdersHref?: string;
  /** Refunds recorded in the period, when the operator may see payments. */
  refunds?: PaymentVerificationData["periodRefunds"];
  /** Tooltip of every trend: what the period is compared with. */
  comparisonLabel?: string;
}

export function FinancialCohortSection({
  financialCohort,
  paidOrdersHref,
  refunds,
  comparisonLabel = "Comparación vs período anterior",
}: FinancialCohortSectionProps) {
  if (financialCohort.status === "UNAUTHORIZED") {
    return null;
  }

  if (financialCohort.status === "UNAVAILABLE") {
    return (
      <AdminSection id="financial-heading" title="Ventas">
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

  const { current, previous, trends } = financialCohort.data;
  const noSales = current.cohortPaidOrders === 0;

  return (
    <AdminSection
      id="financial-heading"
      title="Ventas"
      caption="Pedidos creados en el período, según su pago actual"
    >
      <AdminCard className={styles.summaryCard}>
        {noSales && (
          <EmptyState
            icon={<Moon size={18} />}
            title="Sin ventas pagadas en este período"
            testId="financial-no-sales"
          >
            {previous.cohortPaidOrders > 0
              ? `Período anterior: ${formatCentsToPen(previous.cohortNetCents)} en ${formatInteger(previous.cohortPaidOrders)} ${previous.cohortPaidOrders === 1 ? "pedido" : "pedidos"}.`
              : "El período anterior tampoco tuvo ventas pagadas."}
          </EmptyState>
        )}
        <MetricRow minCellWidth={230}>
          <StaggerItem>
            <MetricWidget
              label="Ventas netas"
              value={formatCentsToPen(current.cohortNetCents)}
              valueTestId="kpi-net-cents"
              size="large"
              href={paidOrdersHref}
              trend={<MonetaryTrendBadge trend={trends.net} comparisonLabel={comparisonLabel} />}
              footnote={
                <>
                  Bruto{" "}
                  <span data-testid="kpi-gross-cents">
                    {formatCentsToPen(current.cohortGrossCents)}
                  </span>{" "}
                  · después de devoluciones
                </>
              }
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Pedidos pagados"
              value={
                <AnimatedCounter value={current.cohortPaidOrders} valueTestId="kpi-paid-orders" />
              }
              size="large"
              href={paidOrdersHref}
              trend={
                <CountTrendBadge trend={trends.paidOrders} comparisonLabel={comparisonLabel} />
              }
              footnote={`${formatInteger(current.cohortActivePaidOrders)} activos, sin reembolsar`}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Ticket promedio"
              value={formatCentsToPen(current.aovCents)}
              valueTestId="kpi-aov-cents"
              size="large"
              href={paidOrdersHref}
              trend={<MonetaryTrendBadge trend={trends.aov} comparisonLabel={comparisonLabel} />}
              footnote="Neto por pedido pagado activo"
            />
          </StaggerItem>
          {refunds && (
            <StaggerItem>
              <MetricWidget
                label="Reembolsos"
                value={formatInteger(refunds.refundCount)}
                valueTestId="kpi-refund-count"
                size="large"
                footnote={
                  refunds.refundOutflow.status === "READY"
                    ? `${formatCentsToPen(refunds.refundOutflow.outflowCents)} devueltos`
                    : "Importe no disponible"
                }
              />
            </StaggerItem>
          )}
        </MetricRow>
      </AdminCard>
    </AdminSection>
  );
}
