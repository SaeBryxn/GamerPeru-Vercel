import React from "react";
import type { PaymentVerificationResult } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import { CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import styles from "./payment-verification-section.module.css";

interface PaymentVerificationSectionProps {
  paymentVerification: PaymentVerificationResult;
}

export function PaymentVerificationSection({
  paymentVerification,
}: PaymentVerificationSectionProps) {
  if (paymentVerification.status === "UNAUTHORIZED") {
    return null;
  }

  const { snapshotQueue, periodActivity, periodRefunds } = paymentVerification.data;

  return (
    <section className={styles.section} aria-labelledby="payments-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.titleWrapper}>
          <CreditCard className={styles.sectionIcon} aria-hidden="true" />
          <h2 id="payments-heading" className={styles.sectionTitle}>
            Verificación de Pagos Manuales
          </h2>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Column 1: Current Operational Snapshot */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.titleWithBadge}>
              <h3 className={styles.cardTitle}>Por verificar ahora</h3>
              <span className={styles.snapshotBadge}>Tiempo real</span>
            </div>
          </div>

          <div className={styles.snapshotRow}>
            <div className={styles.snapshotMetric}>
              <span className={styles.metricLabel}>Pagos en cola</span>
              <span className={styles.metricValueLarge} data-testid="payment-queue-count">
                {formatInteger(snapshotQueue.queueCount)}
              </span>
            </div>

            <div className={styles.snapshotMetric}>
              <span className={styles.metricLabel}>Importe por verificar</span>
              {snapshotQueue.queueAmount.status === "READY" ? (
                <span className={styles.metricValueLarge} data-testid="payment-queue-amount">
                  {formatCentsToPen(snapshotQueue.queueAmount.amountCents)}
                </span>
              ) : (
                <span
                  className={styles.unavailableValue}
                  data-testid="payment-queue-amount-unavailable"
                >
                  <AlertCircle className={styles.unavailableIcon} aria-hidden="true" />
                  No disponible
                </span>
              )}
            </div>
          </div>

          <div className={styles.cardFooter}>
            {snapshotQueue.queueCount === 0 ? (
              <span className={styles.queueClean}>
                <CheckCircle2 className={styles.queueCleanIcon} aria-hidden="true" />
                Cola al día, sin pagos pendientes
              </span>
            ) : (
              <span>Pagos en estado SUBMITTED y VERIFYING</span>
            )}
          </div>
        </div>

        {/* Column 2: Period Activity & Refunds */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Actividad del período</h3>
            <span className={styles.cardCaption}>Comprobantes y reembolsos</span>
          </div>

          <div className={styles.activityGrid}>
            <div className={styles.activityItem} data-testid="payment-submission-attempts">
              <span className={styles.activityLabel}>Comprobantes enviados</span>
              <span className={styles.activityValue}>
                {formatInteger(periodActivity.submissionAttemptsCount)}
              </span>
            </div>

            <div className={styles.activityItem} data-testid="payment-distinct-submissions">
              <span className={styles.activityLabel}>Pagos con actividad</span>
              <span className={styles.activityValue}>
                {formatInteger(periodActivity.distinctPaymentsSubmittedCount)}
              </span>
            </div>

            <div className={styles.activityItem} data-testid="payment-refunds-count">
              <span className={styles.activityLabel}>Devoluciones</span>
              <span className={styles.activityValue}>
                {formatInteger(periodRefunds.refundCount)}
              </span>
            </div>

            <div className={styles.activityItem} data-testid="payment-refunds-outflow">
              <span className={styles.activityLabel}>Monto devuelto</span>
              {periodRefunds.refundOutflow.status === "READY" ? (
                <span className={styles.activityValue}>
                  {formatCentsToPen(periodRefunds.refundOutflow.outflowCents)}
                </span>
              ) : (
                <span className={styles.unavailableValueSmall}>
                  <AlertCircle className={styles.unavailableIcon} aria-hidden="true" />
                  No disponible
                </span>
              )}
            </div>
          </div>

          <div className={styles.cardFooter}>Registro de intentos y reembolsos del período</div>
        </div>
      </div>
    </section>
  );
}
