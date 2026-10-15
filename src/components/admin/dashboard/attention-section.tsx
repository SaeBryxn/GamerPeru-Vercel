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
        label: "Pedidos por preparar",
        hint: "Pagados y listos para armar el envío",
        count: orderQueue.data.toPrepare,
        href: links.orders?.({ orderStatus: "CONFIRMED" }) ?? null,
        tone: "critical",
      },
      {
        id: "orders-awaiting-payment",
        label: "Pedidos sin pagar",
        hint: "Creados y esperando el pago del cliente",
        count: orderQueue.data.awaitingPayment,
        href: links.orders?.({ orderStatus: "PENDING" }) ?? null,
        tone: "attention",
      }
    );
  }
  if (inventoryOverview.status === "READY") {
    items.push({
      id: "out-of-stock",
      label: "SKUs agotados",
      hint: "Variantes activas sin unidades disponibles",
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
  const pending = items.filter((item) => item.count > 0);

  return (
    <AdminSection
      id="attention-heading"
      title="Requiere tu atención"
      caption="Estado actual, sin importar el período elegido"
    >
      {pending.length === 0 ? (
        <p className={styles.allClear} data-testid="attention-all-clear">
          <CheckCircle2 size={16} aria-hidden="true" />
          Todo al día: no hay pagos, pedidos ni SKUs pendientes.
        </p>
      ) : (
        <ul className={styles.attentionGrid}>
          {pending.map((item) => {
            const content = (
              <>
                <span className={styles.attentionLabel}>
                  <StatusDot tone={item.tone} />
                  {item.label}
                </span>
                <span className={styles.attentionCount}>{formatInteger(item.count)}</span>
                <span className={styles.attentionHint}>{item.hint}</span>
                {item.href && (
                  <span className={styles.attentionCta}>
                    Resolver <ArrowRight size={14} aria-hidden="true" />
                  </span>
                )}
              </>
            );
            return (
              <li key={item.id} data-testid={`attention-${item.id}`}>
                {item.href ? (
                  <Link href={item.href} className={styles.attentionCard}>
                    {content}
                  </Link>
                ) : (
                  <div className={styles.attentionCard}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminSection>
  );
}
