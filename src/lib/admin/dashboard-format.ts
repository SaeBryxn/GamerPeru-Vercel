import type { CountTrend, MonetaryTrend } from "./dashboard-types";

export interface FormattedTrend {
  text: string;
  direction: "positive" | "negative" | "neutral";
  ariaLabel: string;
}

/**
 * Exact BigInt-safe PEN currency formatter.
 * Converts integer cents to formatted "S/ X,XXX.XX" strings with zero precision loss.
 * Supports numbers of arbitrary magnitude (including > Number.MAX_SAFE_INTEGER).
 */
export function formatCentsToPen(cents: bigint, options?: { showSign?: boolean }): string {
  const isNegative = cents < 0n;
  const absCents = isNegative ? -cents : cents;

  const soles = absCents / 100n;
  const remainder = absCents % 100n;

  // Thousand-separator formatting on BigInt string
  const solesStr = soles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsStr = remainder.toString().padStart(2, "0");

  const sign = isNegative ? "-" : options?.showSign && cents > 0n ? "+" : "";
  return `${sign}S/ ${solesStr}.${centsStr}`;
}

/**
 * Exact integer formatting with thousand commas.
 */
export function formatInteger(value: number | bigint): string {
  const isNegative = value < 0;
  const str = (isNegative ? -value : value).toString();
  const formatted = str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * BigInt rational percentage formatter for MonetaryTrend.
 * Scales (numerator / denominator) to tenths using integer arithmetic with ROUND HALF UP.
 * No conversion of underlying money to JavaScript Number.
 */
export function formatMonetaryTrend(trend: MonetaryTrend): FormattedTrend {
  switch (trend.semanticState) {
    case "ZERO_BASELINE":
      return {
        text: "0.0%",
        direction: "neutral",
        ariaLabel: "Sin cambio respecto al período anterior (base cero)",
      };

    case "NEW":
      return {
        text: "Nuevo",
        direction: "neutral",
        ariaLabel: "Métrica nueva sin registro en el período anterior",
      };

    case "FLAT":
      return {
        text: "0.0%",
        direction: "neutral",
        ariaLabel: "Sin variación respecto al período anterior (0.0%)",
      };

    case "POSITIVE":
    case "NEGATIVE": {
      if (
        trend.percentageNumerator === null ||
        trend.percentageDenominator === null ||
        trend.percentageDenominator === 0n
      ) {
        return {
          text: "0.0%",
          direction: "neutral",
          ariaLabel: "Sin datos de comparación suficientes",
        };
      }

      const num =
        trend.percentageNumerator < 0n ? -trend.percentageNumerator : trend.percentageNumerator;
      const denom =
        trend.percentageDenominator < 0n
          ? -trend.percentageDenominator
          : trend.percentageDenominator;

      // Scale to tenths (1/1000 of unit) with ROUND HALF UP: (num * 1000 + denom / 2) / denom
      const tenths = (num * 1000n + denom / 2n) / denom;
      const whole = tenths / 10n;
      const decimal = tenths % 10n;

      const isPositive = trend.semanticState === "POSITIVE";
      const formattedNumber = `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.toString()}`;

      return {
        text: `${isPositive ? "+" : "-"}${formattedNumber}%`,
        direction: isPositive ? "positive" : "negative",
        ariaLabel: `${isPositive ? "Incremento" : "Disminución"} de ${formattedNumber}% respecto al período anterior`,
      };
    }
  }
}

/**
 * Formatter for CountTrend (bounded integer metric trends).
 */
export function formatCountTrend(trend: CountTrend): FormattedTrend {
  switch (trend.semanticState) {
    case "ZERO_BASELINE":
      return {
        text: "0.0%",
        direction: "neutral",
        ariaLabel: "Sin cambio respecto al período anterior (base cero)",
      };

    case "NEW":
      return {
        text: "Nuevo",
        direction: "neutral",
        ariaLabel: "Métrica nueva sin registro en el período anterior",
      };

    case "FLAT":
      return {
        text: "0.0%",
        direction: "neutral",
        ariaLabel: "Sin variación respecto al período anterior (0.0%)",
      };

    case "POSITIVE":
    case "NEGATIVE": {
      if (trend.percentageDelta === null || !Number.isFinite(trend.percentageDelta)) {
        return {
          text: "0.0%",
          direction: "neutral",
          ariaLabel: "Sin datos de comparación suficientes",
        };
      }

      const abs = Math.abs(trend.percentageDelta);
      const formatted = abs.toFixed(1);
      const isPositive = trend.semanticState === "POSITIVE";

      return {
        text: `${isPositive ? "+" : "-"}${formatted}%`,
        direction: isPositive ? "positive" : "negative",
        ariaLabel: `${isPositive ? "Incremento" : "Disminución"} de ${formatted}% respecto al período anterior`,
      };
    }
  }
}
