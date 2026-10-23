import React from "react";
import type { OrderQueueResult } from "@/lib/admin/dashboard-types";
import { formatInteger, formatWaiting } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, SectionLink, StatList } from "../ui";
import type { DashboardLinks } from "./dashboard-links";

interface OrderQueueSectionProps {
  orderQueue: OrderQueueResult;
  links: DashboardLinks;
  now: Date;
}

/** Where every open order stands right now, independent of the selected period. */
export function OrderQueueSection({ orderQueue, links, now }: OrderQueueSectionProps) {
  if (orderQueue.status === "UNAUTHORIZED") return null;
  const { awaitingPayment, toPrepare, inProgress, oldestAwaitingPaymentAt, oldestToPrepareAt } =
    orderQueue.data;
  const since = (value?: string | null) => (value ? formatWaiting(value, now).text : undefined);
  const ordersHref = links.orders?.({}) ?? null;

  return (
    <AdminSection
      id="order-queue-heading"
      title="Cola de pedidos"
      caption={ordersHref ? <SectionLink href={ordersHref}>Ir a Pedidos</SectionLink> : null}
    >
      <AdminCard>
        <StatList
          label="Pedidos abiertos por etapa"
          testIdPrefix="queue"
          items={[
            {
              id: "awaiting-payment",
              label: "Esperando pago",
              note: awaitingPayment > 0 ? since(oldestAwaitingPaymentAt) : undefined,
              value: formatInteger(awaitingPayment),
              href: links.orders?.({ orderStatus: "PENDING", paymentStatus: "UNPAID" }) ?? null,
            },
            {
              id: "to-prepare",
              label: "Por preparar",
              note: toPrepare > 0 ? since(oldestToPrepareAt) : undefined,
              value: formatInteger(toPrepare),
              dot: toPrepare > 0 ? "critical" : undefined,
              href:
                links.orders?.({
                  orderStatus: "CONFIRMED",
                  paymentStatus: "PAID",
                  shipmentStatus: "UNFULFILLED",
                }) ?? null,
            },
            {
              id: "in-progress",
              label: "En preparación o envío",
              // The orders list filters one shipment state at a time, so this stage has no single view.
              value: formatInteger(inProgress),
            },
          ]}
        />
      </AdminCard>
    </AdminSection>
  );
}
