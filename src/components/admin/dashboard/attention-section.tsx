import React from "react";
import type { AdminDashboardPayload } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger, formatWaiting } from "@/lib/admin/dashboard-format";
import { ActionList, AdminSection, type ActionItem } from "../ui";
import type { DashboardLinks } from "./dashboard-links";
import { SpotlightLink } from "./spotlight-link";

interface AttentionSectionProps {
  payload: Pick<
    AdminDashboardPayload,
    "paymentVerification" | "orderQueue" | "inventoryOverview" | "period"
  >;
  links: DashboardLinks;
}

/** Work waiting on the team right now, regardless of the selected period. */
export function buildAttentionItems({
  payload,
  links,
}: AttentionSectionProps): ActionItem[] | null {
  const items: ActionItem[] = [];
  const { paymentVerification, orderQueue, inventoryOverview } = payload;
  const now = payload.period.referenceNow;
  const waiting = (since?: string | null) => (since ? formatWaiting(since, now) : null);

  if (paymentVerification.status === "READY") {
    const { queueCount, queueAmount, oldestPendingAt } = paymentVerification.data.snapshotQueue;
    items.push({
      id: "payments-to-verify",
      label: "Pagos por verificar",
      // Money waiting for a decision is not collected money; never shown as zero when unknown.
      detail:
        queueAmount.status === "READY"
          ? `${formatCentsToPen(queueAmount.amountCents)} por confirmar`
          : "Importe no disponible",
      waiting: waiting(oldestPendingAt),
      count: queueCount,
      href: links.payments,
      tone: "critical",
    });
  }
  if (orderQueue.status === "READY") {
    items.push(
      {
        id: "orders-to-prepare",
        label: "Pedidos por preparar",
        detail: "Pagados, listos para armar el envío",
        waiting: waiting(orderQueue.data.oldestToPrepareAt),
        count: orderQueue.data.toPrepare,
        href:
          links.orders?.({
            orderStatus: "CONFIRMED",
            paymentStatus: "PAID",
            shipmentStatus: "UNFULFILLED",
          }) ?? null,
        tone: "critical",
      },
      {
        id: "orders-awaiting-payment",
        label: "Pedidos sin pagar",
        detail: "Esperando el pago del cliente",
        waiting: waiting(orderQueue.data.oldestAwaitingPaymentAt),
        count: orderQueue.data.awaitingPayment,
        href: links.orders?.({ orderStatus: "PENDING", paymentStatus: "UNPAID" }) ?? null,
        tone: "attention",
      }
    );
  }
  if (paymentVerification.status === "READY") {
    items.push({
      id: "payments-rejected",
      label: "Pagos rechazados",
      detail: "Comprobantes no aprobados en el período",
      count: paymentVerification.data.periodActivity.rejectedDecisionsCount ?? 0,
      href: links.payments,
      tone: "attention",
    });
  }
  if (inventoryOverview.status === "READY") {
    const { outOfStockActiveSkus, lowStockActivePositions } = inventoryOverview.data;
    items.push(
      {
        id: "out-of-stock",
        label: "Variantes agotadas",
        detail: "Activas y sin unidades para vender",
        count: outOfStockActiveSkus,
        href: links.inventory?.({ stock: "out" }) ?? links.products?.({ pending: "stock" }) ?? null,
        tone: "attention",
      },
      {
        id: "low-stock",
        label: "Stock bajo",
        detail: `${formatInteger(lowStockActivePositions)} ${lowStockActivePositions === 1 ? "ubicación" : "ubicaciones"} en el punto de reorden`,
        count: lowStockActivePositions,
        href: links.inventory?.({ stock: "low" }) ?? null,
        tone: "attention",
      }
    );
  }
  return items.length > 0 ? items : null;
}

export function AttentionSection(props: AttentionSectionProps) {
  const items = buildAttentionItems(props);
  if (!items) return null;
  return (
    <AdminSection id="attention-heading" title="Requiere acción">
      <ActionList
        items={items}
        allClearLabel="Todo al día: no hay pendientes en las colas que puedes consultar"
        LinkComponent={SpotlightLink}
        testIdPrefix="attention"
      />
    </AdminSection>
  );
}
