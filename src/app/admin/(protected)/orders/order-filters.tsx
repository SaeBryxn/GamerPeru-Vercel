"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { ORDER_STATUSES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from "./order-status-options";
import styles from "./orders.module.css";

interface OrderFiltersProps {
  values: {
    q: string;
    orderStatus: string;
    paymentStatus: string;
    shipmentStatus: string;
    from: string;
    to: string;
  };
  hasFilters: boolean;
}

export function OrderFilters({ values, hasFilters }: OrderFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const omitEmptyFields = (event: FormDataEvent) => {
      for (const name of ["q", "orderStatus", "paymentStatus", "shipmentStatus", "from", "to"]) {
        const field = event.formData.get(name);
        if (typeof field === "string" && field.trim().length === 0) event.formData.delete(name);
      }
    };
    form.addEventListener("formdata", omitEmptyFields);
    return () => form.removeEventListener("formdata", omitEmptyFields);
  }, []);

  return (
    <section className={styles.filterPanel} aria-labelledby="order-filters-title">
      <div className={styles.sectionHeading}>
        <h2 id="order-filters-title">Buscar y filtrar</h2>
        <p>Busca por número de pedido o por el email exacto registrado al comprar.</p>
      </div>
      <form
        ref={formRef}
        method="GET"
        action="/admin/orders"
        className={styles.filterForm}
        data-testid="orders-filter-form"
      >
        <input type="hidden" name="pageSize" value="25" />
        <div className={`${styles.field} ${styles.searchField}`}>
          <label htmlFor="orders-q">Buscar pedido</label>
          <div className={styles.searchControl}>
            <Search size={18} aria-hidden="true" />
            <input
              id="orders-q"
              name="q"
              type="search"
              placeholder="Número de pedido o email exacto"
              defaultValue={values.q}
              maxLength={255}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="orders-status">Estado del pedido</label>
          <select id="orders-status" name="orderStatus" defaultValue={values.orderStatus}>
            <option value="">Todos</option>
            {ORDER_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="orders-payment">Estado del pago</label>
          <select id="orders-payment" name="paymentStatus" defaultValue={values.paymentStatus}>
            <option value="">Todos</option>
            {PAYMENT_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.field} ${styles.shipmentField}`}>
          <label htmlFor="orders-shipment">Estado del envío</label>
          <select id="orders-shipment" name="shipmentStatus" defaultValue={values.shipmentStatus}>
            <option value="">Todos</option>
            {SHIPMENT_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="orders-from">Desde</label>
          <input id="orders-from" name="from" type="date" defaultValue={values.from} />
        </div>
        <div className={styles.field}>
          <label htmlFor="orders-to">Hasta</label>
          <input id="orders-to" name="to" type="date" defaultValue={values.to} />
        </div>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.primaryButton}>
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/admin/orders" className={styles.secondaryButton}>
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
