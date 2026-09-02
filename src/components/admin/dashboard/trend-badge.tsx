import React from "react";
import type { CountTrend, MonetaryTrend } from "@/lib/admin/dashboard-types";
import { formatCountTrend, formatMonetaryTrend } from "@/lib/admin/dashboard-format";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import styles from "./trend-badge.module.css";

interface MonetaryTrendBadgeProps {
  trend: MonetaryTrend;
  comparisonLabel?: string;
}

export function MonetaryTrendBadge({ trend, comparisonLabel }: MonetaryTrendBadgeProps) {
  const formatted = formatMonetaryTrend(trend);

  return (
    <span
      className={`${styles.badge} ${styles[formatted.direction]}`}
      aria-label={formatted.ariaLabel}
      title={comparisonLabel}
    >
      {formatted.direction === "positive" && trend.semanticState !== "NEW" && (
        <TrendingUp className={styles.icon} aria-hidden="true" />
      )}
      {formatted.direction === "negative" && (
        <TrendingDown className={styles.icon} aria-hidden="true" />
      )}
      {formatted.direction === "neutral" && trend.semanticState !== "NEW" && (
        <Minus className={styles.icon} aria-hidden="true" />
      )}
      {trend.semanticState === "NEW" && <Sparkles className={styles.icon} aria-hidden="true" />}
      <span className={styles.text}>{formatted.text}</span>
    </span>
  );
}

interface CountTrendBadgeProps {
  trend: CountTrend;
  comparisonLabel?: string;
}

export function CountTrendBadge({ trend, comparisonLabel }: CountTrendBadgeProps) {
  const formatted = formatCountTrend(trend);

  return (
    <span
      className={`${styles.badge} ${styles[formatted.direction]}`}
      aria-label={formatted.ariaLabel}
      title={comparisonLabel}
    >
      {formatted.direction === "positive" && trend.semanticState !== "NEW" && (
        <TrendingUp className={styles.icon} aria-hidden="true" />
      )}
      {formatted.direction === "negative" && (
        <TrendingDown className={styles.icon} aria-hidden="true" />
      )}
      {formatted.direction === "neutral" && trend.semanticState !== "NEW" && (
        <Minus className={styles.icon} aria-hidden="true" />
      )}
      {trend.semanticState === "NEW" && <Sparkles className={styles.icon} aria-hidden="true" />}
      <span className={styles.text}>{formatted.text}</span>
    </span>
  );
}
