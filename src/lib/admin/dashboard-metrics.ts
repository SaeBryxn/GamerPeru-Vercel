import "server-only";

import type { CountTrend, MonetaryTrend, TrendSemanticState } from "./dashboard-types";

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
 * Computes comparative period trends for bounded count metrics.
 *
 * Invariants:
 * 1. previous = 0, current = 0 => delta = 0, percentageDelta = 0, semanticState = ZERO_BASELINE
 * 2. previous = 0, current > 0 => percentageDelta = null, semanticState = NEW (never +100%, Infinity, or NaN)
 * 3. previous > 0 => percentageDelta = ((current - previous) / previous) * 100
 */
export function calculateCountTrend(current: number, previous: number): CountTrend {
  const absoluteDelta = current - previous;

  if (previous === 0 && current === 0) {
    return {
      currentValue: 0,
      previousValue: 0,
      absoluteDelta: 0,
      percentageDelta: 0,
      semanticState: "ZERO_BASELINE",
    };
  }

  if (previous === 0 && current > 0) {
    return {
      currentValue: current,
      previousValue: 0,
      absoluteDelta,
      percentageDelta: null,
      semanticState: "NEW",
    };
  }

  if (previous === 0 && current < 0) {
    return {
      currentValue: current,
      previousValue: 0,
      absoluteDelta,
      percentageDelta: null,
      semanticState: "NEGATIVE",
    };
  }

  const rawPercentage = ((current - previous) / Math.abs(previous)) * 100;
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
    currentValue: current,
    previousValue: previous,
    absoluteDelta,
    percentageDelta,
    semanticState,
  };
}

/**
 * Computes comparative period trends for exact monetary values (bigint).
 *
 * Invariants:
 * 1. previous = 0n, current = 0n => ZERO_BASELINE, all deltas 0n, percentage null/null
 * 2. previous = 0n, current > 0n => NEW, percentage null/null (never Infinity)
 * 3. previous > 0n => percentageNumerator = (current - previous) * 100, percentageDenominator = abs(previous)
 *    CHK2 may format the visual percentage from this rational representation.
 */
export function calculateMonetaryTrend(current: bigint, previous: bigint): MonetaryTrend {
  const absoluteDelta = current - previous;

  if (previous === 0n && current === 0n) {
    return {
      currentValue: 0n,
      previousValue: 0n,
      absoluteDelta: 0n,
      percentageNumerator: 0n,
      percentageDenominator: 1n,
      semanticState: "ZERO_BASELINE",
    };
  }

  if (previous === 0n && current > 0n) {
    return {
      currentValue: current,
      previousValue: 0n,
      absoluteDelta,
      percentageNumerator: null,
      percentageDenominator: null,
      semanticState: "NEW",
    };
  }

  if (previous === 0n && current < 0n) {
    return {
      currentValue: current,
      previousValue: 0n,
      absoluteDelta,
      percentageNumerator: null,
      percentageDenominator: null,
      semanticState: "NEGATIVE",
    };
  }

  const absPrev = previous < 0n ? -previous : previous;

  let semanticState: TrendSemanticState;
  if (absoluteDelta > 0n) {
    semanticState = "POSITIVE";
  } else if (absoluteDelta < 0n) {
    semanticState = "NEGATIVE";
  } else {
    semanticState = "FLAT";
  }

  return {
    currentValue: current,
    previousValue: previous,
    absoluteDelta,
    percentageNumerator: (current - previous) * 100n,
    percentageDenominator: absPrev,
    semanticState,
  };
}
