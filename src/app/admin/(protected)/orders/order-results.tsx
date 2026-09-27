"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { AdminOrderListRow } from "@/lib/admin/orders/types";
import {
  formatMoney,
  limaDateTime,
  orderLabels,
  paymentLabels,
  shipmentLabels,
  statusTone,
} from "./order-list-format";
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

function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span className={styles.badge} data-tone={statusTone(status)}>
      {label}
    </span>
  );
}

function OrderLink({ orderNumber }: { orderNumber: string }) {
  return <Link href={`/admin/orders/${encodeURIComponent(orderNumber)}`}>{orderNumber}</Link>;
}

export function OrderTable({ rows }: { rows: AdminOrderListRow[] }) {
  const { group, item } = useCascade();

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
            <th scope="col">Artículos</th>
            <th scope="col">Método</th>
            <th scope="col">Creado</th>
            <th scope="col">Actividad</th>
          </tr>
        </thead>
        <motion.tbody variants={group} initial="hidden" animate="visible">
          {rows.map((row) => (
            <motion.tr
              key={row.orderNumber}
              variants={item}
              data-testid={`order-row-${row.orderNumber}`}
            >
              <td className={styles.orderNumber}>
                <OrderLink orderNumber={row.orderNumber} />
              </td>
              <td>
                <span className={styles.customerEmail}>{row.customerEmailMasked}</span>
                <span className={styles.secondaryText}>
                  {row.accountLinkState === "LINKED" ? "Cuenta vinculada" : "Sin cuenta vinculada"}
                </span>
              </td>
              <td>
                <StatusBadge label={orderLabels[row.orderStatus]} status={row.orderStatus} />
              </td>
              <td>
                <StatusBadge label={paymentLabels[row.paymentStatus]} status={row.paymentStatus} />
              </td>
              <td>
                <StatusBadge
                  label={shipmentLabels[row.shipmentStatus]}
                  status={row.shipmentStatus}
                />
              </td>
              <td>
                <span className={styles.money}>{formatMoney(row)}</span>
                {row.integrityIssues.length > 0 && (
                  <span className={styles.integrityWarning}>Revisar datos</span>
                )}
              </td>
              <td className={styles.numeric}>{row.unitCount}</td>
              <td>{row.paymentMethod?.label ?? "Sin método registrado"}</td>
              <td className={styles.dateTime}>{limaDateTime.format(new Date(row.createdAt))}</td>
              <td className={styles.dateTime}>
                {limaDateTime.format(new Date(row.latestOperationalAt))}
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}

export function OrderCards({ rows }: { rows: AdminOrderListRow[] }) {
  const { group, item } = useCascade();

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
            <div>
              <p className={styles.orderNumber}>
                <OrderLink orderNumber={row.orderNumber} />
              </p>
              <p className={styles.customerEmail}>{row.customerEmailMasked}</p>
            </div>
            <StatusBadge label={orderLabels[row.orderStatus]} status={row.orderStatus} />
          </div>
          <dl className={styles.cardFacts}>
            <div>
              <dt>Pago</dt>
              <dd>
                <StatusBadge label={paymentLabels[row.paymentStatus]} status={row.paymentStatus} />
              </dd>
            </div>
            <div>
              <dt>Envío</dt>
              <dd>
                <StatusBadge
                  label={shipmentLabels[row.shipmentStatus]}
                  status={row.shipmentStatus}
                />
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
              <dd>{row.paymentMethod?.label ?? "Sin método registrado"}</dd>
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
        </motion.article>
      ))}
    </motion.div>
  );
}
