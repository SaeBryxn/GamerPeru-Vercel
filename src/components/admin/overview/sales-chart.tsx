"use client";

import React, { useId, useState } from "react";
import { ChartSpline } from "lucide-react";
import type { SalesPoint } from "@/lib/admin/dashboard-overview-types";
import cardStyles from "./overview.module.css";
import styles from "./sales-chart.module.css";

type Metric = "netCents" | "paidOrders" | "profitCents";

const METRICS: Record<Metric, { label: string; subtitle: string; money: boolean }> = {
  netCents: { label: "Ventas netas", subtitle: "Total de ventas netas", money: true },
  paidOrders: { label: "Pedidos", subtitle: "Pedidos pagados", money: false },
  profitCents: { label: "Utilidad", subtitle: "Utilidad estimada", money: true },
};

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatValue(value: number, money: boolean): string {
  return money ? `S/ ${WHOLE.format(Math.round(value / 100))}` : WHOLE.format(value);
}

/** A round axis top (1, 2, 2.5 or 5 × 10ⁿ) so the four gridlines land on readable numbers. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Axis labels to show: every one when few, otherwise about seven evenly spaced. */
function labelIndexes(count: number): Set<number> {
  if (count <= 8) return new Set(Array.from({ length: count }, (_, index) => index));
  const step = Math.ceil(count / 7);
  const indexes = new Set<number>();
  for (let index = 0; index < count; index += step) indexes.add(index);
  return indexes;
}

interface SalesChartProps {
  points: SalesPoint[];
  /** «en los últimos 30 días», «hoy»… */
  periodLabel: string;
  hasProfit: boolean;
  className?: string;
}

export function SalesChart({ points, periodLabel, hasProfit, className }: SalesChartProps) {
  const [metric, setMetric] = useState<Metric>("netCents");
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const config = METRICS[metric];

  const values = points.map((point) => point[metric] ?? 0);
  // An empty period still gets a readable scale: S/ 0–100 or 0–4 orders, not five «S/ 0».
  const top = niceMax(Math.max(...values, config.money ? 10_000 : 4));
  const last = Math.max(points.length - 1, 1);
  const coords = values.map((value, index) => ({
    x: (index / last) * 100,
    y: 100 - (value / top) * 100,
  }));
  const line = coords.map((c, index) => `${index ? "L" : "M"}${c.x} ${c.y}`).join(" ");
  const area = `${line} L100 100 L0 100 Z`;
  const ticks = [4, 3, 2, 1, 0].map((step) => (top * step) / 4);
  const shownLabels = labelIndexes(points.length);
  const allZero = values.every((value) => value === 0);
  const focus = active === null ? null : points[active];

  const pick = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * last));
  };

  return (
    <section className={`${cardStyles.card} ${className ?? ""}`} aria-labelledby={`${id}-title`}>
      <div className={`${cardStyles.cardHead} ${styles.head}`}>
        <span className={cardStyles.chip} data-hue="neutral" aria-hidden="true">
          <ChartSpline />
        </span>
        <div className={cardStyles.cardTitles}>
          <h2 id={`${id}-title`} className={cardStyles.cardTitle}>
            Ventas del período
          </h2>
          <p className={cardStyles.cardSubtitle}>
            {config.subtitle} {periodLabel}
          </p>
        </div>
        <label className={cardStyles.visuallyHidden} htmlFor={`${id}-metric`}>
          Dato del gráfico
        </label>
        <select
          id={`${id}-metric`}
          className={styles.select}
          value={metric}
          onChange={(event) => {
            setMetric(event.target.value as Metric);
            setActive(null);
          }}
        >
          <option value="netCents">Ventas netas</option>
          <option value="paidOrders">Pedidos</option>
          {hasProfit && <option value="profitCents">Utilidad</option>}
        </select>
      </div>

      <div className={styles.chart}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{formatValue(tick, config.money)}</span>
          ))}
        </div>
        <div
          className={styles.plot}
          tabIndex={0}
          role="group"
          aria-label={`${config.label} ${periodLabel}. Usa las flechas para recorrer los valores.`}
          onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            setActive((current) =>
              Math.min(last, Math.max(0, (current ?? (step > 0 ? -1 : last + 1)) + step))
            );
          }}
        >
          <div className={styles.grid} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} />
            ))}
          </div>
          <svg
            className={styles.svg}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--admin-brand)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--admin-brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id}-fill)`} />
            <path d={line} className={styles.line} vectorEffect="non-scaling-stroke" />
            {focus && active !== null && (
              <line
                x1={coords[active]!.x}
                x2={coords[active]!.x}
                y1="0"
                y2="100"
                className={styles.cursor}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {coords.length <= 45 &&
            coords.map((c, index) => (
              <span
                key={points[index]!.key}
                className={`${styles.dot} ${index === active ? styles.dotActive : ""}`}
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                aria-hidden="true"
              />
            ))}
          {focus && active !== null && (
            <div
              className={styles.tooltip}
              style={{
                left: `${coords[active]!.x}%`,
                top: `${coords[active]!.y}%`,
              }}
              data-edge={
                coords[active]!.x > 85 ? "end" : coords[active]!.x < 15 ? "start" : undefined
              }
              role="status"
            >
              <strong>{formatValue(values[active]!, config.money)}</strong>
              <span>{focus.label}</span>
            </div>
          )}
          {allZero && <p className={styles.emptyNote}>Sin ventas pagadas {periodLabel}</p>}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {points.map((point, index) => (
            <span key={point.key} style={{ left: `${(index / last) * 100}%` }}>
              {shownLabels.has(index) ? point.label : ""}
            </span>
          ))}
        </div>
      </div>

      <table className={cardStyles.visuallyHidden}>
        <caption>
          {config.label} {periodLabel}
        </caption>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>{formatValue(values[index]!, config.money)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
