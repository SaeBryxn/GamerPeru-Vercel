import React from "react";
import type { CountTrend, MonetaryTrend } from "@/lib/admin/dashboard-types";
import {
  formatCountTrend,
  formatMonetaryTrend,
  type FormattedTrend,
} from "@/lib/admin/dashboard-format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import styles from "./trend-badge.module.css";

/**
 * The visible wording of a trend. A previous period at zero has no percentage to give,
 * so it says so instead of a decorative "Nuevo"; both at zero read as no change.
 */
function TrendBadge({
  formatted,
  state,
  comparisonLabel,
}: {
  formatted: FormattedTrend;
  state: CountTrend["semanticState"];
  comparisonLabel?: string;
}) {
  const text =
    state === "NEW"
      ? "Sin base previa"
      : state === "ZERO_BASELINE"
        ? "Sin cambios"
        : formatted.text;
  const Icon =
    formatted.direction === "positive"
      ? TrendingUp
      : formatted.direction === "negative"
        ? TrendingDown
        : Minus;
  return (
    <span
      className={`${styles.badge} ${styles[formatted.direction]}`}
      aria-label={formatted.ariaLabel}
      title={comparisonLabel}
      data-state={state}
    >
      {state !== "NEW" && <Icon className={styles.icon} aria-hidden="true" />}
      <span className={styles.text}>{text}</span>
    </span>
  );
}

interface MonetaryTrendBadgeProps {
  trend: MonetaryTrend;
  comparisonLabel?: string;
}

export function MonetaryTrendBadge({ trend, comparisonLabel }: MonetaryTrendBadgeProps) {
  return (
    <TrendBadge
      formatted={formatMonetaryTrend(trend)}
      state={trend.semanticState}
      comparisonLabel={comparisonLabel}
    />
  );
}

interface CountTrendBadgeProps {
  trend: CountTrend;
  comparisonLabel?: string;
}

export function CountTrendBadge({ trend, comparisonLabel }: CountTrendBadgeProps) {
  return (
    <TrendBadge
      formatted={formatCountTrend(trend)}
      state={trend.semanticState}
      comparisonLabel={comparisonLabel}
    />
  );
}
