import { formatCentsToPen } from "@/lib/admin/dashboard-format";

export type MonetaryField = "price_cents" | "compare_at_price_cents" | "cost_cents";

export type ParsePenResult =
  { success: true; cents: number | null } | { success: false; error: string; code: string };

const MAX_INT32_CENTS = 2147483647n;

/**
 * Parses a decimal PEN string into integer minor-unit cents deterministically.
 *
 * Requirements:
 * 1. Authoritative input is a STRING.
 * 2. Accepts: digits, or digits . 1-2 decimal digits (e.g. "129", "129.9", "129.90", "0", "0.50").
 * 3. Optional leading "S/" or "s/" is normalized.
 * 4. Strict comma rejection: Any comma results in immediate rejection.
 * 5. Arithmetic scaling via exact string decomposition + BigInt. Zero floating-point scaling.
 * 6. Maximum value: 2147483647n (signed 32-bit integer).
 * 7. Field bounds:
 *    - price_cents: required, >= 1n
 *    - compare_at_price_cents: optional (blank -> null), >= 0n
 *    - cost_cents: optional (blank -> null), >= 0n
 * 8. Only after proving int32 safety is BigInt converted to JavaScript Number.
 */
export function parsePenInputToCents(rawInput: string, field: MonetaryField): ParsePenResult {
  if (typeof rawInput !== "string") {
    return {
      success: false,
      error: "El valor monetario debe ser una cadena de texto.",
      code: "INVALID_MONEY_TYPE",
    };
  }

  // Strict comma rejection
  if (rawInput.includes(",")) {
    return {
      success: false,
      error: "No se permite el uso de comas. Utiliza punto como separador decimal.",
      code: "COMMA_NOT_ACCEPTED",
    };
  }

  let trimmed = rawInput.trim();

  // Normalize optional leading "S/" or "s/"
  if (trimmed.startsWith("S/") || trimmed.startsWith("s/")) {
    trimmed = trimmed.slice(2).trim();
  }

  // Blank / empty handling
  if (trimmed.length === 0) {
    if (field === "price_cents") {
      return {
        success: false,
        error: "El precio de venta es obligatorio y debe ser mayor a 0.",
        code: "PRICE_REQUIRED",
      };
    }
    return { success: true, cents: null };
  }

  // Validate decimal syntax
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    return {
      success: false,
      error:
        "Formato de moneda inválido. Utiliza números enteros o con hasta 2 decimales (ej: 129.90).",
      code: "INVALID_MONEY_SYNTAX",
    };
  }

  const parts = trimmed.split(".");
  const wholePartStr = parts[0] ?? "0";
  const fractionPartStr = (parts[1] ?? "").padEnd(2, "0");

  let totalCents: bigint;
  try {
    totalCents = BigInt(wholePartStr) * 100n + BigInt(fractionPartStr);
  } catch {
    return {
      success: false,
      error: "No se pudo interpretar el valor numérico.",
      code: "INVALID_MONEY_SYNTAX",
    };
  }

  // Field-specific range validation in BigInt
  if (field === "price_cents" && totalCents < 1n) {
    return {
      success: false,
      error: "El precio de venta debe ser de al menos S/ 0.01.",
      code: "PRICE_NOT_POSITIVE",
    };
  }

  if ((field === "compare_at_price_cents" || field === "cost_cents") && totalCents < 0n) {
    return {
      success: false,
      error: "El valor monetario no puede ser negativo.",
      code: "MONEY_NEGATIVE",
    };
  }

  // Check PostgreSQL INTEGER (int32) boundary
  if (totalCents > MAX_INT32_CENTS) {
    return {
      success: false,
      error: "El valor monetario excede el límite máximo permitido (S/ 21,474,836.47).",
      code: "MONEY_VALUE_EXCEEDS_MAX_INT32",
    };
  }

  return {
    success: true,
    cents: Number(totalCents),
  };
}

/**
 * Convenience helper that throws a CatalogDomainError on invalid input.
 */
export function parsePenInputToCentsOrThrow(rawInput: string, field: MonetaryField): number | null {
  const res = parsePenInputToCents(rawInput, field);
  if (!res.success) {
    const error = new Error(res.error) as Error & { code: string };
    error.code = res.code;
    throw error;
  }
  return res.cents;
}

/**
 * Exact BigInt-safe PEN money display formatter.
 */
export function formatCentsToPenDisplay(cents: number | bigint | null | undefined): string | null {
  if (cents === null || cents === undefined) {
    return null;
  }
  return formatCentsToPen(BigInt(cents));
}
