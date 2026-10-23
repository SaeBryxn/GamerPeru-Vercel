import React from "react";
import Link from "next/link";
import type { OrderPipelineResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, StaggerItem, StatusDot } from "../ui";
import type { StatusDotTone } from "../ui";
import { CountTrendBadge } from "./trend-badge";
import styles from "./order-pipeline-section.module.css";

interface OrderPipelineSectionProps {
  orderPipeline: OrderPipelineResult;
  /** Orders of the period in the orders list, optionally narrowed to one status. */
  periodOrdersHref?: ((filters?: Record<string, string>) => string) | null;
}

interface StatusItem {
  id: string;
  /** Value of the orders list `orderStatus` filter. */
  orderStatus: string;
  label: string;
  count: number;
  /** Still moving through the flow (dark bar) or already closed (light bar). */
  isOpen: boolean;
  dot: StatusDotTone;
}

export function OrderPipelineSection({
  orderPipeline,
  periodOrdersHref,
}: OrderPipelineSectionProps) {
  if (orderPipeline.status === "UNAUTHORIZED") {
    return null;
  }

  const { current, trends } = orderPipeline.data;
  const total = current.totalCreatedOrders;

  const statuses: StatusItem[] = [
    {
      id: "pending",
      orderStatus: "PENDING",
      label: "Pendientes",
      count: current.pendingOrders,
      isOpen: true,
      // Orders waiting on payment are the one thing here that asks for a person.
      dot: current.pendingOrders > 0 ? "critical" : "neutral",
    },
    {
      id: "confirmed",
      orderStatus: "CONFIRMED",
      label: "Confirmados",
      count: current.confirmedOrders,
      isOpen: true,
      dot: "neutral",
    },
    {
      id: "processing",
      orderStatus: "PROCESSING",
      label: "En proceso",
      count: current.processingOrders,
      isOpen: true,
      dot: "neutral",
    },
    {
      id: "fulfilled",
      orderStatus: "FULFILLED",
      label: "Completados",
      count: current.fulfilledOrders,
      isOpen: true,
      dot: "ok",
    },
    {
      id: "cancelled",
      orderStatus: "CANCELLED",
      label: "Cancelados",
      count: current.cancelledOrders,
      isOpen: false,
      dot: "neutral",
    },
    {
      id: "expired",
      orderStatus: "EXPIRED",
      label: "Expirados",
      count: current.expiredOrders,
      isOpen: false,
      dot: "neutral",
    },
    {
      id: "refunded",
      orderStatus: "REFUNDED",
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
          <div className={styles.summaryHead}>
            <span>Total de pedidos creados</span>
            {periodOrdersHref ? (
              <Link
                href={periodOrdersHref()}
                className={styles.total}
                data-testid="orders-total-created"
              >
                {formatInteger(total)}
              </Link>
            ) : (
              <strong className={styles.total} data-testid="orders-total-created">
                {formatInteger(total)}
              </strong>
            )}
            <CountTrendBadge
              trend={trends.totalCreatedOrders}
              comparisonLabel="Comparación vs período anterior"
            />
          </div>
        </StaggerItem>

        <ol className={styles.steps} aria-label="Pedidos por estado">
          {statuses.map((status) => {
            const share = total > 0 ? (status.count / total) * 100 : 0;
            return (
              <li
                key={status.id}
                className={styles.step}
                data-state={status.id}
                data-testid={`order-status-${status.id}`}
              >
                <StaggerItem>
                  {periodOrdersHref ? (
                    <Link
                      href={periodOrdersHref({ orderStatus: status.orderStatus })}
                      className={`${styles.stepLabel} ${styles.stepLink}`}
                    >
                      <StatusDot tone={status.dot} />
                      {status.label}
                    </Link>
                  ) : (
                    <span className={styles.stepLabel}>
                      <StatusDot tone={status.dot} />
                      {status.label}
                    </span>
                  )}
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
