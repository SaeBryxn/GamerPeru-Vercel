import React from "react";
import Link from "next/link";
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

const METRIC_TONE: Record<StatusDotTone, string | undefined> = {
  neutral: undefined,
  ok: styles.metricOk,
  attention: styles.metricAttention,
  critical: styles.metricCritical,
};

/** A small status mark beside a metric label; the metric's number takes the same hue. */
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
  /** Where the number is resolved; the whole cell becomes a link. */
  href?: string;
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
  href,
}: MetricWidgetProps) {
  const sizeClass =
    size === "large" ? styles.metricValueLarge : size === "small" ? styles.metricValueSmall : "";
  const toneClass = dot ? METRIC_TONE[dot] : undefined;

  const body = (
    <>
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
    </>
  );

  return href ? (
    <Link
      href={href}
      className={[styles.metric, styles.metricLink, toneClass].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {body}
    </Link>
  ) : (
    <div className={[styles.metric, toneClass].filter(Boolean).join(" ")} data-testid={testId}>
      {body}
    </div>
  );
}

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const BADGE_TONE: Record<StatusBadgeTone, string | undefined> = {
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  info: styles.badgeInfo,
  neutral: styles.badgeNeutral,
};

/** Status pill: tinted fill, hairline border and a dot, so a row reads at a glance. */
export function StatusBadge({
  tone,
  children,
  testId,
}: {
  tone: StatusBadgeTone;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <span
      className={[styles.badge, BADGE_TONE[tone]].filter(Boolean).join(" ")}
      data-tone={tone}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

export interface SegmentedNavOption {
  href: string;
  label: React.ReactNode;
  active: boolean;
}

/** Compact segmented control made of links, for views that live in the URL. */
export function SegmentedNav({ label, options }: { label: string; options: SegmentedNavOption[] }) {
  return (
    <nav className={styles.segmented} aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          className={[styles.segment, option.active ? styles.segmentActive : ""]
            .filter(Boolean)
            .join(" ")}
          aria-current={option.active ? "page" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** "Ir a Pedidos →": the way from a summary to the screen that resolves it. */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.sectionLink}>
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export interface StatListItem {
  id: string;
  label: string;
  value: React.ReactNode;
  /** Quiet context after the value, such as how long the oldest one waited. */
  note?: React.ReactNode;
  href?: string | null;
  dot?: StatusDotTone;
}

/** Label and number per line inside one card; each line may open its filtered list. */
export function StatList({
  items,
  label,
  testIdPrefix = "stat",
}: {
  items: StatListItem[];
  label: string;
  testIdPrefix?: string;
}) {
  return (
    <ul className={styles.statList} aria-label={label}>
      {items.map((item) => {
        const body = (
          <>
            <span className={styles.statLabel}>
              {item.dot ? <StatusDot tone={item.dot} /> : null}
              {item.label}
              {item.note ? <span className={styles.statNote}>{item.note}</span> : null}
            </span>
            <span className={styles.statValue} data-testid={`${testIdPrefix}-${item.id}`}>
              {item.value}
            </span>
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className={`${styles.statRow} ${styles.statLink}`}>
                {body}
              </Link>
            ) : (
              <div className={styles.statRow}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** What a block shows when it has nothing to list: what it means, never a bare zero. */
export function EmptyState({
  icon,
  title,
  children,
  testId,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className={styles.empty} data-testid={testId}>
      {icon ? (
        <span className={styles.emptyIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        {children ? <p className={styles.emptyText}>{children}</p> : null}
      </div>
    </div>
  );
}
