import React from "react";
import Link from "@/components/app-link";
import { ArrowRight, CheckCircle2, CreditCard, PackageCheck } from "lucide-react";
import type { AdminDashboardPayload } from "@/lib/admin/dashboard-types";
import type { DashboardLinks } from "./dashboard-links";
import { buildAttentionItems } from "./attention-section";
import styles from "./dashboard-focus.module.css";

export function DashboardFocus({
  payload,
  links,
}: {
  payload: AdminDashboardPayload;
  links: DashboardLinks;
}) {
  const items = buildAttentionItems({ payload, links });
  if (!items) return null;
  const pending = items
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        (a.tone === "critical" ? 0 : 1) - (b.tone === "critical" ? 0 : 1) ||
        (a.waiting ? Date.parse(a.waiting.dateTime) : Infinity) -
          (b.waiting ? Date.parse(b.waiting.dateTime) : Infinity)
    );
  const first = pending[0];
  if (!first)
    return (
      <section className={styles.allClear} aria-label="Trabajo pendiente">
        <CheckCircle2 size={22} />
        <div>
          <strong>Todo al día</strong>
          <p>No hay pendientes en las áreas que puedes consultar.</p>
        </div>
      </section>
    );
  const Icon = first.id === "payments-to-verify" ? CreditCard : PackageCheck;
  const action =
    first.id === "payments-to-verify"
      ? "Revisar pagos"
      : first.id === "orders-to-prepare"
        ? "Preparar pedidos"
        : first.id === "orders-awaiting-payment"
          ? "Ver pedidos"
          : "Revisar inventario";
  return (
    <section className={styles.root} aria-labelledby="focus-heading">
      <h2 id="focus-heading">Por atender</h2>
      <div className={styles.primary} data-testid={`attention-${first.id}`}>
        <span className={styles.icon}>
          <Icon size={24} />
        </span>
        <div className={styles.mainCopy}>
          <div>
            <strong>{first.count}</strong>
            <h3>{first.label}</h3>
          </div>
          <p>
            {first.detail}
            {first.waiting && (
              <>
                <span aria-hidden="true"> · </span>
                <time dateTime={first.waiting.dateTime} title={first.waiting.title}>
                  {first.waiting.text}
                </time>
              </>
            )}
          </p>
        </div>
        {first.href && (
          <Link href={first.href} className={styles.action}>
            {action}
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {pending.length > 1 && (
        <ul className={styles.rest}>
          {pending.slice(1).map((item) => (
            <li key={item.id} data-testid={`attention-${item.id}`}>
              {item.href ? (
                <Link href={item.href}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <div>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
