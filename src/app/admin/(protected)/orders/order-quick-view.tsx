"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ExternalLink, LoaderCircle, Package } from "lucide-react";
import { DrawerHeader, SideDrawer, StatusBadge } from "@/components/admin/ui";
import {
  getAdminOrderQuickViewAction,
  type AdminOrderQuickViewResult,
} from "@/lib/admin/orders/quick-view-actions";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCentsToPen } from "@/lib/admin/dashboard-format";
import {
  limaDateTime,
  orderLabels,
  paymentLabels,
  shipmentLabels,
  statusTone,
} from "./order-list-format";
import { timelineLabels } from "./[orderNumber]/order-activity";
import styles from "./orders.module.css";

function money(cents: number, currency: string): string {
  return currency === "PEN"
    ? formatCentsToPen(BigInt(cents))
    : `${currency} ${(cents / 100).toFixed(2)}`;
}

/** Order summary in a side panel: products with photos, customer, payment, shipping and activity. */
export function OrderQuickView({
  orderNumber,
  onClose,
}: {
  orderNumber: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [result, setResult] = useState<AdminOrderQuickViewResult | null>(null);

  useEffect(() => {
    let active = true;
    getAdminOrderQuickViewAction(orderNumber)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult({ status: "SYSTEM_ERROR" });
      });
    return () => {
      active = false;
    };
  }, [orderNumber]);

  const detail = result?.status === "READY" ? result.detail : null;
  const shipment = detail?.shipments[0] ?? null;

  return (
    <SideDrawer labelledBy={titleId} onClose={onClose} size="wide" testId="order-quick-view">
      <DrawerHeader
        titleId={titleId}
        eyebrow="Vista rápida"
        title={orderNumber}
        onClose={onClose}
      />
      <div className={styles.quickBody}>
        {result === null ? (
          <p className={styles.quickLoading} role="status">
            <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
            Cargando pedido…
          </p>
        ) : !detail ? (
          <p role="alert">No se pudo cargar el pedido. Ábrelo en su página.</p>
        ) : (
          <>
            <div className={styles.quickBadges}>
              <StatusBadge tone={statusTone(detail.order.status)}>
                {orderLabels[detail.order.status]}
              </StatusBadge>
              <StatusBadge tone={statusTone(detail.payment?.status ?? "NOT_RECORDED")}>
                {paymentLabels[detail.payment?.status ?? "NOT_RECORDED"]}
              </StatusBadge>
              <StatusBadge tone={statusTone(shipment?.status ?? "NOT_RECORDED")}>
                {shipmentLabels[shipment?.status ?? "NOT_RECORDED"]}
              </StatusBadge>
              <span className={styles.quickDate}>
                {limaDateTime.format(new Date(detail.order.createdAt))}
              </span>
            </div>

            <section className={styles.quickSection} aria-label="Productos">
              <h3>Productos</h3>
              <ul className={styles.quickItems}>
                {detail.items.map((item, index) => {
                  const preview =
                    result?.status === "READY" ? result.itemPreviews[index] : undefined;
                  const url = resolvePublicMediaUrl(preview?.imageObjectKey ?? null);
                  return (
                    <li key={item.id}>
                      <span className={styles.thumb}>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" width={36} height={36} loading="lazy" />
                        ) : (
                          <Package size={16} aria-hidden="true" />
                        )}
                      </span>
                      <span className={styles.quickItemText}>
                        <strong>{item.productName}</strong>
                        <span>
                          {item.variantTitle} · {item.sku} · {item.quantity} ×{" "}
                          {money(item.unitPriceCents, detail.order.currency)}
                        </span>
                      </span>
                      <span className={styles.money}>
                        {money(item.lineTotalCents, detail.order.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {detail.pricing && (
                <p className={styles.quickTotal}>
                  Total <strong>{money(detail.pricing.totalCents, detail.pricing.currency)}</strong>
                </p>
              )}
            </section>

            <div className={styles.quickGrid}>
              <section className={styles.quickSection} aria-label="Cliente">
                <h3>Cliente</h3>
                <p>{detail.address?.recipientName ?? "Sin nombre registrado"}</p>
                <p>{detail.contact.customerEmail}</p>
                <p>{detail.contact.customerPhone}</p>
                {detail.address && (
                  <p className={styles.secondaryText}>
                    {detail.address.streetAddress}, {detail.address.district},{" "}
                    {detail.address.province}
                  </p>
                )}
              </section>
              <section className={styles.quickSection} aria-label="Pago y envío">
                <h3>Pago y envío</h3>
                <p>{detail.payment?.methodLabel ?? "Sin método registrado"}</p>
                {shipment?.trackingNumber && (
                  <p>
                    {shipment.courierName ? `${shipment.courierName} · ` : ""}Guía{" "}
                    {shipment.trackingNumber}
                  </p>
                )}
              </section>
            </div>

            {detail.timeline.entries.length > 0 && (
              <section className={styles.quickSection} aria-label="Actividad">
                <h3>Actividad reciente</h3>
                <ol className={styles.quickTimeline}>
                  {detail.timeline.entries.slice(0, 6).map((entry) => (
                    <li key={entry.id}>
                      <span>{timelineLabels[entry.type]}</span>
                      <time dateTime={entry.timestamp}>
                        {limaDateTime.format(new Date(entry.timestamp))}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
        <Link
          href={`/admin/orders/${encodeURIComponent(orderNumber)}`}
          className={styles.primaryButton}
        >
          Abrir pedido completo
          <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </div>
    </SideDrawer>
  );
}
