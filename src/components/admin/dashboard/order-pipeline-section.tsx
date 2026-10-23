import React from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import type { OrderPipelineResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, BarList, EmptyState } from "../ui";
import { CountTrendBadge } from "./trend-badge";
import styles from "./order-pipeline-section.module.css";

interface OrderPipelineSectionProps {
  orderPipeline: OrderPipelineResult;
  /** Orders of the period in the orders list, optionally narrowed to one status. */
  periodOrdersHref?: ((filters?: Record<string, string>) => string) | null;
  comparisonLabel?: string;
}

/** Value of the orders list `orderStatus` filter, in the order an order moves through. */
const STATUSES = [
  { id: "pending", orderStatus: "PENDING", label: "Pendientes", key: "pendingOrders" },
  { id: "confirmed", orderStatus: "CONFIRMED", label: "Confirmados", key: "confirmedOrders" },
  { id: "processing", orderStatus: "PROCESSING", label: "En proceso", key: "processingOrders" },
  { id: "fulfilled", orderStatus: "FULFILLED", label: "Completados", key: "fulfilledOrders" },
  { id: "cancelled", orderStatus: "CANCELLED", label: "Cancelados", key: "cancelledOrders" },
  { id: "expired", orderStatus: "EXPIRED", label: "Expirados", key: "expiredOrders" },
  { id: "refunded", orderStatus: "REFUNDED", label: "Reembolsados", key: "refundedOrders" },
] as const;

export function OrderPipelineSection({
  orderPipeline,
  periodOrdersHref,
  comparisonLabel = "Comparación vs período anterior",
}: OrderPipelineSectionProps) {
  if (orderPipeline.status === "UNAUTHORIZED") {
    return null;
  }

  const { current, trends } = orderPipeline.data;
  const total = current.totalCreatedOrders;

  return (
    <AdminSection id="orders-heading" title="Pedidos del período">
      <AdminCard>
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>Pedidos creados</span>
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
          <CountTrendBadge trend={trends.totalCreatedOrders} comparisonLabel={comparisonLabel} />
        </div>
        {total === 0 ? (
          <EmptyState icon={<Inbox size={18} />} title="No se crearon pedidos en este período">
            Cuando entren pedidos verás aquí en qué estado está cada uno.
          </EmptyState>
        ) : (
          <BarList
            label="Pedidos por estado"
            total={total}
            testIdPrefix="order-status"
            items={STATUSES.map((status) => ({
              id: status.id,
              label: status.label,
              value: current[status.key],
              href: periodOrdersHref?.({ orderStatus: status.orderStatus }) ?? null,
            }))}
          />
        )}
      </AdminCard>
    </AdminSection>
  );
}
