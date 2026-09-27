"use client";

import React from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { Package, Truck } from "lucide-react";
import { DomeLink } from "@/components/ui";
import type { CustomerOrderSummaryDTO } from "@/lib/account/orders";
import type { OrderStatusTone } from "@/lib/account/order-status";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./account.module.css";

// Fixed zone so the server render and the hydrated client agree on the day.
const DATE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Lima",
});

const TONE_CLASS: Record<OrderStatusTone, string | undefined> = {
  pending: styles.statusPending,
  progress: styles.statusProgress,
  transit: styles.statusTransit,
  success: styles.statusSuccess,
  muted: styles.statusMuted,
};

export const ORDER_CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
};

export function formatOrderDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

export function OrderStatusPill({ order }: { order: CustomerOrderSummaryDTO }) {
  return (
    <span className={`${styles.statusPill} ${TONE_CLASS[order.status.tone] ?? ""}`}>
      {order.status.label}
    </span>
  );
}

function OrderThumbs({ order }: { order: CustomerOrderSummaryDTO }) {
  const shown = order.items.length;
  const hiddenUnits = order.itemCount - order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className={styles.thumbs} aria-hidden="true">
      {order.items.map((item, index) => {
        const url = resolvePublicMediaUrl(item.imageObjectKey);
        return (
          <span key={`${item.productName}-${index}`} className={styles.thumb}>
            {url ? (
              <Image src={url} alt="" fill sizes="56px" className={styles.thumbImage} />
            ) : (
              <Package size={20} />
            )}
          </span>
        );
      })}
      {shown === 0 && (
        <span className={styles.thumb}>
          <Package size={20} />
        </span>
      )}
      {hiddenUnits > 0 && (
        <span className={`${styles.thumb} ${styles.thumbMore}`}>+{hiddenUnits}</span>
      )}
    </div>
  );
}

function itemsLine(order: CustomerOrderSummaryDTO): string {
  const [first] = order.items;
  if (!first) return `${order.itemCount} producto${order.itemCount === 1 ? "" : "s"}`;
  const others = order.itemCount - first.quantity;
  return others > 0 ? `${first.productName} y ${others} más` : first.productName;
}

/** One order: thumbnails, number, date, status, total and the actions that apply to it. */
export function OrderCard({ order }: { order: CustomerOrderSummaryDTO }) {
  const detailHref = `/checkout/confirmacion/${encodeURIComponent(order.orderNumber)}`;

  return (
    <motion.article
      className={styles.orderCard}
      variants={ORDER_CARD_VARIANTS}
      aria-label={`Pedido ${order.orderNumber}`}
      data-testid="account-order-card"
    >
      <OrderThumbs order={order} />

      <div className={styles.orderMain}>
        <div className={styles.orderTopRow}>
          <span className={styles.orderNumber}>{order.orderNumber}</span>
          <OrderStatusPill order={order} />
        </div>
        <span className={styles.orderMeta}>
          {formatOrderDate(order.createdAt)} · {order.itemCount} producto
          {order.itemCount === 1 ? "" : "s"}
        </span>
        <span className={styles.orderItemsLine}>{itemsLine(order)}</span>
        {order.trackingNumber && (
          <span className={styles.tracking}>
            {order.courierName ? `${order.courierName} · ` : ""}Guía {order.trackingNumber}
          </span>
        )}
      </div>

      <div className={styles.orderSide}>
        <span className={styles.orderTotal}>{formatCurrency(order.totalCents)}</span>
        <div className={styles.orderActions}>
          {order.trackingUrl && (
            <DomeLink
              href={order.trackingUrl}
              tone="dark"
              className={styles.domeSmall}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Truck size={14} aria-hidden="true" className={styles.domeIcon} />
              Rastrear pedido
            </DomeLink>
          )}
          <DomeLink href={detailHref} tone="light" className={styles.domeSmallLight}>
            Ver pedido
          </DomeLink>
        </div>
      </div>
    </motion.article>
  );
}
