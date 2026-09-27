import React from "react";
import styles from "./admin-ui.module.css";

interface AdminSectionProps {
  id: string;
  title: string;
  caption?: React.ReactNode;
  children: React.ReactNode;
}

/** A titled block of the admin: typography carries the hierarchy, not a frame. */
export function AdminSection({ id, title, caption, children }: AdminSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        {caption ? <p className={styles.sectionCaption}>{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface AdminCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the standard inner padding; leave off for cards made of cells. */
  padded?: boolean;
}

/** One flat surface. Never nest another card inside; split it with cells instead. */
export function AdminCard({ padded = false, className, ...rest }: AdminCardProps) {
  return (
    <div
      className={[styles.card, padded ? styles.cardPadded : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/** Metric cells side by side inside one card, divided by hairlines. */
export function MetricRow({
  minCellWidth,
  children,
}: {
  /** Narrowest a cell may get before the row wraps; small numbers can sit closer. */
  minCellWidth?: number;
  children: React.ReactNode;
}) {
  const style = minCellWidth
    ? ({ "--cell-min": `${minCellWidth}px` } as React.CSSProperties)
    : undefined;
  return (
    <div className={styles.cellRow} style={style}>
      {children}
    </div>
  );
}

export type StatusDotTone = "neutral" | "ok" | "attention" | "critical";

const DOT_TONE: Record<StatusDotTone, string | undefined> = {
  neutral: undefined,
  ok: styles.dotOk,
  attention: styles.dotAttention,
  critical: styles.dotCritical,
};

/** A 6px status mark: the only place a signal color appears next to a number. */
export function StatusDot({ tone = "neutral" }: { tone?: StatusDotTone }) {
  return (
    <span className={[styles.dot, DOT_TONE[tone]].filter(Boolean).join(" ")} aria-hidden="true" />
  );
}

interface MetricWidgetProps {
  label: string;
  value: React.ReactNode;
  /** Put on the value itself so tests and tooling read the bare number. */
  valueTestId?: string;
  size?: "small" | "default" | "large";
  trend?: React.ReactNode;
  footnote?: React.ReactNode;
  dot?: StatusDotTone;
  testId?: string;
}

/** Label in quiet gray, the number large and tabular, context underneath. */
export function MetricWidget({
  label,
  value,
  valueTestId,
  size = "default",
  trend,
  footnote,
  dot,
  testId,
}: MetricWidgetProps) {
  const sizeClass =
    size === "large" ? styles.metricValueLarge : size === "small" ? styles.metricValueSmall : "";

  return (
    <div className={styles.metric} data-testid={testId}>
      <div className={styles.metricHead}>
        <span className={styles.metricLabel}>
          {dot ? <StatusDot tone={dot} /> : null}
          {label}
        </span>
        {trend}
      </div>
      <span
        className={[styles.metricValue, sizeClass].filter(Boolean).join(" ")}
        data-testid={valueTestId}
      >
        {value}
      </span>
      {footnote ? <span className={styles.metricFootnote}>{footnote}</span> : null}
    </div>
  );
}
