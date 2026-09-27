import React from "react";
import type { OrderPipelineResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricWidget, StaggerItem, StatusDot } from "../ui";
import type { StatusDotTone } from "../ui";
import { CountTrendBadge } from "./trend-badge";
import styles from "./order-pipeline-section.module.css";

interface OrderPipelineSectionProps {
  orderPipeline: OrderPipelineResult;
}

interface StatusItem {
  id: string;
  label: string;
  count: number;
  /** Still moving through the flow (dark bar) or already closed (light bar). */
  isOpen: boolean;
  dot: StatusDotTone;
}

export function OrderPipelineSection({ orderPipeline }: OrderPipelineSectionProps) {
  if (orderPipeline.status === "UNAUTHORIZED") {
    return null;
  }

  const { current, trends } = orderPipeline.data;
  const total = current.totalCreatedOrders;

  const statuses: StatusItem[] = [
    {
      id: "pending",
      label: "Pendientes",
      count: current.pendingOrders,
      isOpen: true,
      // Orders waiting on payment are the one thing here that asks for a person.
      dot: current.pendingOrders > 0 ? "critical" : "neutral",
    },
    {
      id: "confirmed",
      label: "Confirmados",
      count: current.confirmedOrders,
      isOpen: true,
      dot: "neutral",
    },
    {
      id: "processing",
      label: "En proceso",
      count: current.processingOrders,
      isOpen: true,
      dot: "neutral",
    },
    {
      id: "fulfilled",
      label: "Completados",
      count: current.fulfilledOrders,
      isOpen: true,
      dot: "ok",
    },
    {
      id: "cancelled",
      label: "Cancelados",
      count: current.cancelledOrders,
      isOpen: false,
      dot: "neutral",
    },
    {
      id: "expired",
      label: "Expirados",
      count: current.expiredOrders,
      isOpen: false,
      dot: "neutral",
    },
    {
      id: "refunded",
      label: "Reembolsados",
      count: current.refundedOrders,
      isOpen: false,
      dot: "neutral",
    },
  ];

  return (
    <AdminSection id="orders-heading" title="Flujo de Pedidos">
      <AdminCard>
        <StaggerItem className={styles.summary}>
          <MetricWidget
            label="Total de pedidos creados"
            value={formatInteger(total)}
            valueTestId="orders-total-created"
            size="large"
            trend={
              <CountTrendBadge
                trend={trends.totalCreatedOrders}
                comparisonLabel="Comparación vs período anterior"
              />
            }
          />
        </StaggerItem>

        <ol className={styles.steps} aria-label="Pedidos por estado">
          {statuses.map((status) => {
            const share = total > 0 ? (status.count / total) * 100 : 0;
            return (
              <li key={status.id} className={styles.step} data-testid={`order-status-${status.id}`}>
                <StaggerItem>
                  <span className={styles.stepLabel}>
                    <StatusDot tone={status.dot} />
                    {status.label}
                  </span>
                  <span className={styles.stepCount}>{formatInteger(status.count)}</span>
                  <span
                    className={styles.track}
                    role="img"
                    aria-label={`${status.label}: ${share.toFixed(0)}% del total`}
                  >
                    <span
                      className={`${styles.fill} ${status.isOpen ? styles.fillOpen : styles.fillClosed}`}
                      style={{ width: `${share}%` }}
                    />
                  </span>
                </StaggerItem>
              </li>
            );
          })}
        </ol>
      </AdminCard>
    </AdminSection>
  );
}
