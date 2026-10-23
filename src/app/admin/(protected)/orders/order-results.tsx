"use client";

import { useState } from "react";
import Link from "@/components/app-link";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Eye, MailCheck, MailX } from "lucide-react";
import { StatusBadge } from "@/components/admin/ui";
import type { AdminOrderListRow } from "@/lib/admin/orders/types";
import {
  formatMoney,
  limaDateTime,
  limaShortDateTime,
  orderLabels,
  paymentLabels,
  shipmentLabels,
  statusTone,
} from "./order-list-format";
import { OrderQuickView } from "./order-quick-view";
import { OrderThumbs } from "./order-thumbs";
import { ProofPreview } from "./proof-preview";
import styles from "./orders.module.css";

const EASE = [0.25, 0.1, 0.25, 1] as const;

function useCascade(): { group: Variants; item: Variants } {
  const reduceMotion = useReducedMotion();
  return {
    group: { hidden: {}, visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.03 } } },
    item: {
      hidden: { opacity: 0, y: reduceMotion ? 0 : 4 },
      visible: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.2, ease: EASE } },
    },
  };
}

function OrderLink({ orderNumber }: { orderNumber: string }) {
  return <Link href={`/admin/orders/${encodeURIComponent(orderNumber)}`}>{orderNumber}</Link>;
}

function EmailState({ sent }: { sent: boolean }) {
  return sent ? (
    <span className={styles.emailSent} title="Correo de confirmación enviado">
      <MailCheck size={14} aria-hidden="true" />
      <span className={styles.visuallyHidden}>Correo de confirmación enviado</span>
    </span>
  ) : (
    <span className={styles.emailPending} title="Correo de confirmación no registrado">
      <MailX size={14} aria-hidden="true" />
      <span className={styles.visuallyHidden}>Correo de confirmación no registrado</span>
    </span>
  );
}

/** Clicks on the row open the quick view, except clicks on its own links and buttons. */
function isRowClick(event: React.MouseEvent<HTMLElement>): boolean {
  return !(event.target as HTMLElement).closest("a, button");
}

export function OrderTable({ rows, canVerify }: { rows: AdminOrderListRow[]; canVerify: boolean }) {
  const { group, item } = useCascade();
  const [quickView, setQuickView] = useState<string | null>(null);

  return (
    <div className={styles.tableScroll} data-testid="orders-desktop-list">
      <table className={styles.table}>
        <caption>Listado de pedidos</caption>
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Cliente</th>
            <th scope="col">Estado</th>
            <th scope="col">Pago</th>
            <th scope="col">Envío</th>
            <th scope="col">Total</th>
            <th scope="col">Creado</th>
          </tr>
        </thead>
        <motion.tbody variants={group} initial="hidden" animate="visible">
          {rows.map((row) => (
            <motion.tr
              key={row.orderNumber}
              variants={item}
              className={styles.clickableRow}
              onClick={(event) => {
                if (isRowClick(event)) setQuickView(row.orderNumber);
              }}
              data-testid={`order-row-${row.orderNumber}`}
            >
              <td>
                <div className={styles.orderCell}>
                  <OrderThumbs items={row.itemPreviews} lineCount={row.itemLineCount} />
                  <div className={styles.orderCellText}>
                    <span className={styles.orderNumber}>
                      <OrderLink orderNumber={row.orderNumber} />
                    </span>
                    <span className={styles.secondaryText}>
                      {row.unitCount} artículo{row.unitCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.quickViewButton}
                    onClick={() => setQuickView(row.orderNumber)}
                    aria-label={`Vista rápida del pedido ${row.orderNumber}`}
                    title="Vista rápida"
                  >
                    <Eye size={15} aria-hidden="true" />
                  </button>
                </div>
              </td>
              <td className={styles.customerCell}>
                <span className={styles.customerName}>
                  <span className={styles.customerNameText}>
                    {row.recipientName ?? "Sin nombre"}
                  </span>
                  <EmailState sent={row.confirmationEmailSent} />
                </span>
                <span className={styles.customerEmail} title={row.customerEmailMasked}>
                  {row.customerEmailMasked}
                </span>
                <span className={styles.secondaryText}>
                  {row.accountLinkState === "LINKED" ? "Cuenta vinculada" : "Sin cuenta vinculada"}
                </span>
              </td>
              <td>
                <StatusBadge tone={statusTone(row.orderStatus)}>
                  {orderLabels[row.orderStatus]}
                </StatusBadge>
              </td>
              <td>
                <StatusBadge tone={statusTone(row.paymentStatus)}>
                  {paymentLabels[row.paymentStatus]}
                </StatusBadge>
                <span className={styles.methodCell}>
                  <span className={styles.secondaryText}>
                    {row.paymentMethod?.label ?? "Sin método registrado"}
                  </span>
                  {canVerify && row.latestSubmission?.hasProof && (
                    <ProofPreview
                      submissionId={row.latestSubmission.id}
                      orderNumber={row.orderNumber}
                    />
                  )}
                </span>
              </td>
              <td>
                <StatusBadge tone={statusTone(row.shipmentStatus)}>
                  {shipmentLabels[row.shipmentStatus]}
                </StatusBadge>
              </td>
              <td>
                <span className={styles.money}>{formatMoney(row)}</span>
                {row.integrityIssues.length > 0 && (
                  <span className={styles.integrityWarning}>Revisar datos</span>
                )}
              </td>
              <td className={styles.dateTime} title={limaDateTime.format(new Date(row.createdAt))}>
                {limaShortDateTime.format(new Date(row.createdAt))}
                <span className={styles.secondaryText}>
                  Act. {limaShortDateTime.format(new Date(row.latestOperationalAt))}
                </span>
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
      <AnimatePresence>
        {quickView && (
          <OrderQuickView
            key={quickView}
            orderNumber={quickView}
            onClose={() => setQuickView(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function OrderCards({ rows, canVerify }: { rows: AdminOrderListRow[]; canVerify: boolean }) {
  const { group, item } = useCascade();
  const [quickView, setQuickView] = useState<string | null>(null);

  return (
    <motion.div
      className={styles.cardList}
      data-testid="orders-mobile-list"
      variants={group}
      initial="hidden"
      animate="visible"
    >
      {rows.map((row) => (
        <motion.article
          key={row.orderNumber}
          variants={item}
          className={styles.orderCard}
          data-testid={`order-card-${row.orderNumber}`}
        >
          <div className={styles.cardHeader}>
            <div className={styles.orderCell}>
              <OrderThumbs items={row.itemPreviews} lineCount={row.itemLineCount} />
              <div className={styles.orderCellText}>
                <p className={styles.orderNumber}>
                  <OrderLink orderNumber={row.orderNumber} />
                </p>
                <p className={styles.customerEmail}>
                  {row.recipientName ? `${row.recipientName} · ` : ""}
                  {row.customerEmailMasked}
                </p>
              </div>
            </div>
            <StatusBadge tone={statusTone(row.orderStatus)}>
              {orderLabels[row.orderStatus]}
            </StatusBadge>
          </div>
          <dl className={styles.cardFacts}>
            <div>
              <dt>Pago</dt>
              <dd>
                <StatusBadge tone={statusTone(row.paymentStatus)}>
                  {paymentLabels[row.paymentStatus]}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Envío</dt>
              <dd>
                <StatusBadge tone={statusTone(row.shipmentStatus)}>
                  {shipmentLabels[row.shipmentStatus]}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className={styles.money}>{formatMoney(row)}</dd>
            </div>
            <div>
              <dt>Artículos</dt>
              <dd>{row.unitCount}</dd>
            </div>
            <div>
              <dt>Método</dt>
              <dd className={styles.methodCell}>
                {row.paymentMethod?.label ?? "Sin método registrado"}
                {canVerify && row.latestSubmission?.hasProof && (
                  <ProofPreview
                    submissionId={row.latestSubmission.id}
                    orderNumber={row.orderNumber}
                  />
                )}
              </dd>
            </div>
            <div>
              <dt>Creado</dt>
              <dd>{limaDateTime.format(new Date(row.createdAt))}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{limaDateTime.format(new Date(row.latestOperationalAt))}</dd>
            </div>
          </dl>
          {row.integrityIssues.length > 0 && (
            <p className={styles.integrityWarning}>Revisar datos del pedido</p>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setQuickView(row.orderNumber)}
          >
            <Eye size={15} aria-hidden="true" />
            Vista rápida
          </button>
        </motion.article>
      ))}
      <AnimatePresence>
        {quickView && (
          <OrderQuickView
            key={quickView}
            orderNumber={quickView}
            onClose={() => setQuickView(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
