import "server-only";

import type { MetricTrend, TrendSemanticState } from "./dashboard-types";

/**
 * Calculates Average Order Value (AOV) in integer minor-unit PEN cents
 * using exact BigInt ROUND HALF UP quotient/remainder semantics.
 *
 * Guaranteed Invariants:
 * 1. Zero floating-point arithmetic in the authoritative calculation.
 * 2. Denominator == 0 => 0 cents (S/ 0.00).
 * 3. Ties at exactly 0.5 cents round upward (for non-negative values).
 * 4. Examples:
 *    - 100 / 3 => 33
 *    - 101 / 2 => 51
 *    - 100 / 2 => 50
 *    - 1 / 2 => 1
 *    - 0 denom => 0
 */
export function calculateAovCents(cohortNetCents: bigint, cohortActivePaidOrders: bigint): bigint {
  if (cohortActivePaidOrders <= 0n) {
    return 0n;
  }
  if (cohortNetCents <= 0n) {
    return 0n;
  }

  // Integer ROUND HALF UP formula for non-negative integers:
  // floor((numerator + floor(denominator / 2)) / denominator)
  const halfDenominator = cohortActivePaidOrders / 2n;
  return (cohortNetCents + halfDenominator) / cohortActivePaidOrders;
}

/**
 * Computes comparative period trends with truthful zero-baseline semantics.
 *
 * Invariants:
 * 1. previous = 0, current = 0 => delta = 0, percentageDelta = 0, semanticState = ZERO_BASELINE
 * 2. previous = 0, current > 0 => percentageDelta = null, semanticState = NEW (never +100%, Infinity, or NaN)
 * 3. previous > 0 => percentageDelta = ((current - previous) / previous) * 100
 */
export function calculateMetricTrend(
  current: number | bigint,
  previous: number | bigint
): MetricTrend {
  const curr = typeof current === "bigint" ? Number(current) : current;
  const prev = typeof previous === "bigint" ? Number(previous) : previous;
  const absoluteDelta = curr - prev;

  if (prev === 0 && curr === 0) {
    return {
      currentValue: 0,
      previousValue: 0,
      absoluteDelta: 0,
      percentageDelta: 0,
      semanticState: "ZERO_BASELINE",
    };
  }

  if (prev === 0 && curr > 0) {
    return {
      currentValue: curr,
      previousValue: 0,
      absoluteDelta,
      percentageDelta: null,
      semanticState: "NEW",
    };
  }

  if (prev === 0 && curr < 0) {
    return {
      currentValue: curr,
      previousValue: 0,
      absoluteDelta,
      percentageDelta: null,
      semanticState: "NEGATIVE",
    };
  }

  const rawPercentage = ((curr - prev) / Math.abs(prev)) * 100;
  // Round percentage to 2 decimal places without precision loss
  const percentageDelta = Math.round(rawPercentage * 100) / 100;

  let semanticState: TrendSemanticState;
  if (absoluteDelta > 0) {
    semanticState = "POSITIVE";
  } else if (absoluteDelta < 0) {
    semanticState = "NEGATIVE";
  } else {
    semanticState = "FLAT";
  }

  return {
    currentValue: curr,
    previousValue: prev,
    absoluteDelta,
    percentageDelta,
    semanticState,
  };
}
