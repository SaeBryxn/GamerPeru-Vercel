"use client";

import React from "react";
import { m, type Variants } from "framer-motion";
import { Package } from "lucide-react";
import { DomeLink } from "@/components/ui";
import type { CustomerOrderSummaryDTO } from "@/lib/account/orders";
import { OrderCard } from "./order-card";
import styles from "./account.module.css";

const LIST_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

/** Order history, cascading in card by card when the tab opens. */
export function OrderList({ orders }: { orders: CustomerOrderSummaryDTO[] }) {
  if (orders.length === 0) {
    return (
      <div className={`${styles.card} ${styles.emptyState}`}>
        <span className={styles.emptyIcon}>
          <Package size={24} aria-hidden="true" />
        </span>
        <h2 className={styles.cardTitle}>Aún no tienes pedidos</h2>
        <p className={styles.cardText}>
          Cuando compres en Gamer Perú, aquí verás cada pedido con su estado y seguimiento.
        </p>
        <DomeLink href="/productos" tone="dark" className={styles.domeSmall}>
          Explorar la tienda
        </DomeLink>
      </div>
    );
  }

  return (
    <m.ul className={styles.orderList} variants={LIST_VARIANTS} initial="hidden" animate="visible">
      {orders.map((order) => (
        <li key={order.orderNumber}>
          <OrderCard order={order} />
        </li>
      ))}
    </m.ul>
  );
}
