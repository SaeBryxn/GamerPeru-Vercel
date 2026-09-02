import React from "react";
import type { OrderPipelineResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { CountTrendBadge } from "./trend-badge";
import { ShoppingCart } from "lucide-react";
import styles from "./order-pipeline-section.module.css";

interface OrderPipelineSectionProps {
  orderPipeline: OrderPipelineResult;
}

interface StatusItem {
  id: string;
  label: string;
  count: number;
  colorClass: string;
}

export function OrderPipelineSection({ orderPipeline }: OrderPipelineSectionProps) {
  if (orderPipeline.status === "UNAUTHORIZED") {
    return null;
  }

  const { current, trends } = orderPipeline.data;

  const statuses: StatusItem[] = [
    {
      id: "pending",
      label: "Pendientes",
      count: current.pendingOrders,
      colorClass: "statusPending",
    },
    {
      id: "confirmed",
      label: "Confirmados",
      count: current.confirmedOrders,
      colorClass: "statusConfirmed",
    },
    {
      id: "processing",
      label: "En proceso",
      count: current.processingOrders,
      colorClass: "statusProcessing",
    },
    {
      id: "fulfilled",
      label: "Completados",
      count: current.fulfilledOrders,
      colorClass: "statusFulfilled",
    },
    {
      id: "cancelled",
      label: "Cancelados",
      count: current.cancelledOrders,
      colorClass: "statusCancelled",
    },
    {
      id: "expired",
      label: "Expirados",
      count: current.expiredOrders,
      colorClass: "statusExpired",
    },
    {
      id: "refunded",
      label: "Reembolsados",
      count: current.refundedOrders,
      colorClass: "statusRefunded",
    },
  ];

  const total = current.totalCreatedOrders;

  return (
    <section className={styles.section} aria-labelledby="orders-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.titleWrapper}>
          <ShoppingCart className={styles.sectionIcon} aria-hidden="true" />
          <h2 id="orders-heading" className={styles.sectionTitle}>
            Flujo de Pedidos
          </h2>
        </div>
      </div>

      <div className={styles.containerCard}>
        <div className={styles.summaryRow}>
          <div>
            <span className={styles.summaryLabel}>Total de pedidos creados</span>
            <div className={styles.summaryValue} data-testid="orders-total-created">
              {formatInteger(total)}
            </div>
          </div>
          <CountTrendBadge
            trend={trends.totalCreatedOrders}
            comparisonLabel="Comparación vs período anterior"
          />
        </div>

        {/* Proportional Distribution Bar */}
        {total > 0 && (
          <div
            className={styles.distributionBar}
            role="progressbar"
            aria-label="Distribución proporcional de estados de pedidos"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {statuses.map((s) => {
              if (s.count === 0) return null;
              const pct = (s.count / total) * 100;
              return (
                <div
                  key={s.id}
                  className={`${styles.barSegment} ${styles[s.colorClass]}`}
                  style={{ width: `${pct}%` }}
                  title={`${s.label}: ${s.count} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
        )}

        {/* Status Grid */}
        <div className={styles.statusGrid}>
          {statuses.map((s) => (
            <div key={s.id} className={styles.statusCard} data-testid={`order-status-${s.id}`}>
              <div className={styles.statusCardHeader}>
                <span
                  className={`${styles.statusDot} ${styles[s.colorClass]}`}
                  aria-hidden="true"
                />
                <span className={styles.statusName}>{s.label}</span>
              </div>
              <span className={styles.statusCount}>{formatInteger(s.count)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
