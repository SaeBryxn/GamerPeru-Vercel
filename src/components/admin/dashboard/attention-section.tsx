import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { AdminDashboardPayload } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminSection, StatusDot } from "../ui";
import type { DashboardLinks } from "./dashboard-links";
import styles from "./operations.module.css";

interface AttentionItem {
  id: string;
  label: string;
  hint: string;
  count: number;
  href: string | null;
  tone: "critical" | "attention";
  oldestAt?: string | null;
}

interface AttentionSectionProps {
  payload: Pick<AdminDashboardPayload, "paymentVerification" | "orderQueue" | "inventoryOverview">;
  links: DashboardLinks;
}

/** Work waiting on the team right now, regardless of the selected period. */
export function buildAttentionItems({
  payload,
  links,
}: AttentionSectionProps): AttentionItem[] | null {
  const items: AttentionItem[] = [];
  const { paymentVerification, orderQueue, inventoryOverview } = payload;

  if (paymentVerification.status === "READY") {
    items.push({
      id: "payments-to-verify",
      oldestAt: paymentVerification.data.snapshotQueue.oldestPendingAt,
      label: "Pagos por verificar",
      hint: "Comprobantes de Yape o Plin esperando revisión",
      count: paymentVerification.data.snapshotQueue.queueCount,
      href: links.payments,
      tone: "critical",
    });
  }
  if (orderQueue.status === "READY") {
    items.push(
      {
        id: "orders-to-prepare",
        oldestAt: orderQueue.data.oldestToPrepareAt,
        label: "Pedidos por preparar",
        hint: "Pagados y listos para armar el envío",
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
        oldestAt: orderQueue.data.oldestAwaitingPaymentAt,
        label: "Pedidos sin pagar",
        hint: "Creados y esperando el pago del cliente",
        count: orderQueue.data.awaitingPayment,
        href: links.orders?.({ orderStatus: "PENDING", paymentStatus: "UNPAID" }) ?? null,
        tone: "attention",
      }
    );
  }
  if (inventoryOverview.status === "READY") {
    items.push({
      id: "out-of-stock",
      label: "Colores o tallas sin stock",
      hint: "Versiones activas sin unidades disponibles",
      count: inventoryOverview.data.outOfStockActiveSkus,
      href: links.products?.({ pending: "stock" }) ?? null,
      tone: "attention",
    });
  }
  return items.length > 0 ? items : null;
}

export function AttentionSection(props: AttentionSectionProps) {
  const items = buildAttentionItems(props);
  if (!items) return null;
  const pending = items
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const priority = (item: AttentionItem) => (item.tone === "critical" ? 0 : 1);
      return (
        priority(a) - priority(b) ||
        (a.oldestAt ? Date.parse(a.oldestAt) : Infinity) -
          (b.oldestAt ? Date.parse(b.oldestAt) : Infinity) ||
        0
      );
    });
  const next = pending.find((item) => item.href);

  return (
    <AdminSection
      id="attention-heading"
      title="Para resolver ahora"
      caption="Por prioridad y antigüedad"
    >
      {pending.length === 0 ? (
        <p className={styles.allClear} data-testid="attention-all-clear">
          <CheckCircle2 size={16} aria-hidden="true" />
          Sin pendientes en las colas que puedes consultar
        </p>
      ) : (
        <>
          <ul className={styles.attentionGrid}>
            {pending.map((item) => {
              const content = (
                <>
                  <span className={styles.attentionCount}>{formatInteger(item.count)}</span>
                  <span className={styles.attentionCopy}>
                    {item === next && <span className={styles.nextTask}>Siguiente tarea</span>}
                    <span className={styles.attentionLabel}>
                      <StatusDot tone={item.tone} />
                      {item.label}
                    </span>
                    <span className={styles.attentionHint}>{item.hint}</span>
                    {item.oldestAt && (
                      <time className={styles.attentionHint} dateTime={item.oldestAt}>
                        Más antiguo:{" "}
                        {new Date(item.oldestAt).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                  </span>
                  {item.href && (
                    <span className={styles.attentionCta}>
                      <span>Revisar</span> <ArrowRight size={16} aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return (
                <li key={item.id} data-testid={`attention-${item.id}`}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={styles.attentionCard}
                      data-priority={item === next ? "next" : undefined}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={styles.attentionCard}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AdminSection>
  );
}
