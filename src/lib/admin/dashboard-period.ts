import "server-only";

export const CANONICAL_PERIOD_SELECTORS = [
  "TODAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
] as const;

export type DashboardPeriodSelector = (typeof CANONICAL_PERIOD_SELECTORS)[number];

export interface DashboardPeriodRange {
  start: Date;
  end: Date;
}

export interface ResolvedDashboardPeriod {
  selector: DashboardPeriodSelector;
  referenceNow: Date;
  current: DashboardPeriodRange;
  previous: DashboardPeriodRange;
}

/**
 * Extracts Lima-local calendar date components (year, month, day, hour, minute, second)
 * from a given UTC instant. America/Lima is UTC-5 year-round.
 */
export function getLimaDateComponents(instant: Date): {
  year: number;
  month: number; // 1-indexed (1 = January, 12 = December)
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = parseInt(part.value, 10);
    }
  }

  return {
    year: map.year ?? instant.getUTCFullYear(),
    month: map.month ?? instant.getUTCMonth() + 1,
    day: map.day ?? instant.getUTCDate(),
    hour: map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  };
}

/**
 * Returns the exact UTC Date corresponding to 00:00:00.000 local Lima time (UTC-5)
 * for the specified Lima calendar date.
 */
export function startOfLimaDay(year: number, month: number, day: number): Date {
  // Lima is UTC-5: 00:00:00.000 Lima is exactly 05:00:00.000 UTC
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
}

/**
 * Resolves the canonical half-open intervals [start, end) for both the current
 * reporting window and the preceding comparison window.
 *
 * Guaranteed Invariants:
 * 1. Exactly ONE referenceNow instant drives both windows.
 * 2. All boundaries are half-open [start, end) (timestamp >= start AND timestamp < end).
 * 3. Never uses 23:59:59.999.
 * 4. THIS_MONTH previous window is strictly clamped to the exclusive boundary of that
 *    previous calendar month (startOfCurrentMonthLima). Never overflows into the current month.
 */
export function resolveDashboardPeriod(
  selector: DashboardPeriodSelector = "LAST_30_DAYS",
  referenceNow: Date = new Date()
): ResolvedDashboardPeriod {
  const lp = getLimaDateComponents(referenceNow);

  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (selector) {
    case "TODAY": {
      // Current: [startOfTodayLima, startOfTomorrowLima)
      currentStart = startOfLimaDay(lp.year, lp.month, lp.day);
      currentEnd = startOfLimaDay(lp.year, lp.month, lp.day + 1);

      // Previous: [startOfYesterdayLima, startOfTodayLima)
      previousStart = startOfLimaDay(lp.year, lp.month, lp.day - 1);
      previousEnd = currentStart;
      break;
    }

    case "LAST_7_DAYS": {
      // Current: [startOfTodayLima - 6 calendar days, referenceNow)
      currentStart = startOfLimaDay(lp.year, lp.month, lp.day - 6);
      currentEnd = referenceNow;

      // Previous: equal duration immediately preceding currentStart
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousEnd = currentStart;
      previousStart = new Date(currentStart.getTime() - durationMs);
      break;
    }

    case "LAST_30_DAYS": {
      // Current: [startOfTodayLima - 29 calendar days, referenceNow)
      currentStart = startOfLimaDay(lp.year, lp.month, lp.day - 29);
      currentEnd = referenceNow;

      // Previous: equal duration immediately preceding currentStart
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousEnd = currentStart;
      previousStart = new Date(currentStart.getTime() - durationMs);
      break;
    }

    case "THIS_MONTH": {
      // Current: [startOfCurrentMonthLima, referenceNow)
      currentStart = startOfLimaDay(lp.year, lp.month, 1);
      currentEnd = referenceNow;

      // Previous month start: 1st of (month - 1)
      const startOfPreviousMonthLima = startOfLimaDay(lp.year, lp.month - 1, 1);
      const elapsedMs = currentEnd.getTime() - currentStart.getTime();
      const candidatePreviousEnd = new Date(startOfPreviousMonthLima.getTime() + elapsedMs);

      // Clamping invariant: previous month comparison cannot exceed the exclusive boundary of that month
      // The exclusive boundary of the previous month is exactly startOfCurrentMonthLima.
      const previousMonthExclusiveEnd = currentStart;
      previousStart = startOfPreviousMonthLima;
      previousEnd = new Date(
        Math.min(candidatePreviousEnd.getTime(), previousMonthExclusiveEnd.getTime())
      );
      break;
    }

    default: {
      const _exhaustiveCheck: never = selector;
      throw new Error(`Unsupported dashboard period selector: ${_exhaustiveCheck}`);
    }
  }

  return {
    selector,
    referenceNow,
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}
