import React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CreditCard,
  Clock3,
  PackageOpen,
  Warehouse,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { AdminDashboardPayload } from "@/lib/admin/dashboard-types";
import { formatCentsToPen, formatInteger } from "@/lib/admin/dashboard-format";
import type { DashboardLinks } from "./dashboard-links";
import styles from "./operations-snapshot.module.css";

interface OperationsSnapshotProps {
  payload: Pick<
    AdminDashboardPayload,
    "paymentVerification" | "orderQueue" | "inventoryOverview" | "catalogOverview"
  >;
  links: DashboardLinks;
}
interface SnapshotCard {
  id: string;
  label: string;
  value: number;
  note: string;
  href: string | null;
  icon: LucideIcon;
  tone: "amber" | "blue" | "violet" | "green";
}

export function OperationsSnapshot({ payload, links }: OperationsSnapshotProps) {
  const cards: SnapshotCard[] = [];
  if (payload.paymentVerification.status === "READY") {
    const { queueCount, queueAmount } = payload.paymentVerification.data.snapshotQueue;
    cards.push({
      id: "payments",
      label: "Pagos por revisar",
      value: queueCount,
      note:
        queueAmount.status === "READY"
          ? `${formatCentsToPen(queueAmount.amountCents)} por verificar`
          : "Importe no disponible",
      href: links.payments,
      icon: CreditCard,
      tone: "amber",
    });
  }
  if (payload.orderQueue.status === "READY") {
    cards.push(
      {
        id: "prepare",
        label: "Por preparar",
        value: payload.orderQueue.data.toPrepare,
        note: "Pedidos pagados · listos para preparar",
        href:
          links.orders?.({
            orderStatus: "CONFIRMED",
            paymentStatus: "PAID",
            shipmentStatus: "UNFULFILLED",
          }) ?? null,
        icon: PackageOpen,
        tone: "blue",
      },
      {
        id: "unpaid",
        label: "Esperando pago",
        value: payload.orderQueue.data.awaitingPayment,
        note: "Pedidos pendientes de pago del cliente",
        href: links.orders?.({ orderStatus: "PENDING", paymentStatus: "UNPAID" }) ?? null,
        icon: Clock3,
        tone: "violet",
      }
    );
  }
  if (payload.inventoryOverview.status === "READY") {
    const inventory = payload.inventoryOverview.data;
    cards.push({
      id: "inventory",
      label: "Colores o tallas agotados",
      value: inventory.outOfStockActiveSkus,
      note: `${formatInteger(inventory.globalPhysicalBalances.availableToSellUnits)} unidades disponibles · todas las ubicaciones`,
      href: links.products?.({ pending: "stock" }) ?? null,
      icon: Warehouse,
      tone: inventory.outOfStockActiveSkus > 0 ? "amber" : "green",
    });
  } else if (payload.catalogOverview.status === "READY") {
    cards.push({
      id: "catalog",
      label: "Productos en la tienda",
      value: payload.catalogOverview.data.publishedProducts,
      note: `${formatInteger(payload.catalogOverview.data.draftProducts)} productos en borrador`,
      href: links.products?.({ status: "PUBLISHED" }) ?? null,
      icon: ShoppingBag,
      tone: "green",
    });
  }
  if (cards.length === 0) return null;
  return (
    <section className={styles.snapshot} aria-label="Estado actual de la operación">
      {cards.map(({ icon: Icon, ...card }) => {
        const content = (
          <>
            <span className={styles.cardHead}>
              <span className={styles.icon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              {card.href && <ArrowUpRight size={17} aria-hidden="true" />}
            </span>
            <span className={styles.value} data-testid={`snapshot-${card.id}`}>
              {formatInteger(card.value)}
            </span>
            <span className={styles.label}>{card.label}</span>
            <span className={styles.note}>{card.note}</span>
          </>
        );
        return card.href ? (
          <Link key={card.id} href={card.href} className={styles.card} data-tone={card.tone}>
            {content}
          </Link>
        ) : (
          <div key={card.id} className={styles.card} data-tone={card.tone}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
