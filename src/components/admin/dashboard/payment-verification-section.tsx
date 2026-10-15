import React from "react";
import { AlertCircle } from "lucide-react";
import type { PaymentVerificationResult } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricWidget, StaggerItem, StatusDot } from "../ui";
import styles from "./payment-verification-section.module.css";

interface PaymentVerificationSectionProps {
  paymentVerification: PaymentVerificationResult;
  queueHref?: string;
}

function Unavailable({ testId }: { testId?: string }) {
  return (
    <span className={styles.unavailable} data-testid={testId}>
      <AlertCircle className={styles.unavailableIcon} aria-hidden="true" />
      No disponible
    </span>
  );
}

export function PaymentVerificationSection({
  paymentVerification,
  queueHref,
}: PaymentVerificationSectionProps) {
  if (paymentVerification.status === "UNAUTHORIZED") {
    return null;
  }

  const { snapshotQueue, periodActivity, periodRefunds } = paymentVerification.data;
  const hasQueue = snapshotQueue.queueCount > 0;

  return (
    <AdminSection id="payments-heading" title="Verificación de Pagos Manuales">
      <AdminCard className={styles.split}>
        <StaggerItem className={styles.queue}>
          <div className={styles.blockHead}>
            <h3 className={styles.blockTitle}>Por verificar ahora</h3>
            <span className={styles.live}>
              <StatusDot tone={hasQueue ? "critical" : "ok"} />
              Tiempo real
            </span>
          </div>

          <div className={styles.queueMetrics}>
            <MetricWidget
              label="Pagos en cola"
              value={formatInteger(snapshotQueue.queueCount)}
              valueTestId="payment-queue-count"
              href={queueHref}
              size="large"
            />
            {snapshotQueue.queueAmount.status === "READY" ? (
              <MetricWidget
                label="Importe por verificar"
                value={formatCentsToPen(snapshotQueue.queueAmount.amountCents)}
                valueTestId="payment-queue-amount"
                href={queueHref}
                size="large"
              />
            ) : (
              <MetricWidget
                label="Importe por verificar"
                value={<Unavailable testId="payment-queue-amount-unavailable" />}
                size="small"
              />
            )}
          </div>

          <p className={styles.note}>
            {hasQueue
              ? "Pagos en estado SUBMITTED y VERIFYING"
              : "Cola al día, sin pagos pendientes"}
          </p>
        </StaggerItem>

        <StaggerItem className={styles.activity}>
          <div className={styles.blockHead}>
            <h3 className={styles.blockTitle}>Actividad del período</h3>
            <span className={styles.blockCaption}>Comprobantes y reembolsos</span>
          </div>

          <div className={styles.activityGrid}>
            <MetricWidget
              label="Comprobantes enviados"
              value={formatInteger(periodActivity.submissionAttemptsCount)}
              size="small"
              testId="payment-submission-attempts"
            />
            <MetricWidget
              label="Pagos con actividad"
              value={formatInteger(periodActivity.distinctPaymentsSubmittedCount)}
              size="small"
              testId="payment-distinct-submissions"
            />
            <MetricWidget
              label="Devoluciones"
              value={formatInteger(periodRefunds.refundCount)}
              size="small"
              testId="payment-refunds-count"
            />
            <MetricWidget
              label="Monto devuelto"
              value={
                periodRefunds.refundOutflow.status === "READY" ? (
                  formatCentsToPen(periodRefunds.refundOutflow.outflowCents)
                ) : (
                  <Unavailable />
                )
              }
              size="small"
              testId="payment-refunds-outflow"
            />
          </div>

          <p className={styles.note}>Registro de intentos y reembolsos del período</p>
        </StaggerItem>
      </AdminCard>
    </AdminSection>
  );
}
