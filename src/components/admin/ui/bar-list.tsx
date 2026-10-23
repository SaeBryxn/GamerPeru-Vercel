import React from "react";
import Link from "next/link";
import styles from "./bar-list.module.css";

export interface BarListItem {
  id: string;
  label: string;
  value: number;
  href?: string | null;
}

interface BarListProps {
  label: string;
  items: BarListItem[];
  /** Share base; defaults to the sum of the values. */
  total?: number;
  testIdPrefix?: string;
}

/**
 * Horizontal bars for parts of one total (orders by status, stock by location).
 * Magnitude in a single neutral hue: the label names each bar, the number is
 * written beside it and the hover title gives the share, so nothing relies on color.
 */
export function BarList({ label, items, total, testIdPrefix = "bar" }: BarListProps) {
  const base = total ?? items.reduce((sum, item) => sum + item.value, 0);
  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item) => {
        const share = base > 0 ? (item.value / base) * 100 : 0;
        const summary = `${item.label}: ${item.value.toLocaleString("en-US")} de ${base.toLocaleString("en-US")} (${share.toFixed(0)} %)`;
        return (
          <li
            key={item.id}
            className={styles.row}
            data-empty={item.value === 0 ? "" : undefined}
            data-testid={`${testIdPrefix}-${item.id}`}
            title={summary}
          >
            {item.href ? (
              <Link href={item.href} className={`${styles.label} ${styles.link}`}>
                {item.label}
              </Link>
            ) : (
              <span className={styles.label}>{item.label}</span>
            )}
            <span className={styles.value}>{item.value.toLocaleString("en-US")}</span>
            <span className={styles.track} role="img" aria-label={summary}>
              <span className={styles.fill} style={{ width: `${share}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
