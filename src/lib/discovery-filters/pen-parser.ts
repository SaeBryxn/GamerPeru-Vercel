import { FILTER_SAFETY_BOUNDS } from "./types";

/**
 * Parses a decimal PEN string into integer cents deterministically.
 * Supports dot or comma decimal separator.
 * Validates range [1, 9999999] cents.
 * Rejects invalid strings, multiple decimal points, > 2 decimal places, negatives, zero, overflow.
 */
export function parsePenStringToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > FILTER_SAFETY_BOUNDS.MAX_PRICE_PARAM_LENGTH) {
    return null;
  }

  // Normalize comma to dot
  const normalized = trimmed.replace(",", ".");

  // Strict regex: optional integer digits, optional dot and 1-2 decimal digits
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parts = normalized.split(".");
  const intPartStr = parts[0] ?? "0";
  const decPartStr = parts[1] ?? "";

  const intPart = parseInt(intPartStr, 10);
  if (Number.isNaN(intPart) || !Number.isSafeInteger(intPart)) {
    return null;
  }

  let decPart = 0;
  if (decPartStr.length === 1) {
    decPart = parseInt(decPartStr, 10) * 10;
  } else if (decPartStr.length === 2) {
    decPart = parseInt(decPartStr, 10);
  }

  const totalCents = intPart * 100 + decPart;

  if (
    totalCents < FILTER_SAFETY_BOUNDS.MIN_PRICE_CENTS ||
    totalCents > FILTER_SAFETY_BOUNDS.MAX_PRICE_CENTS
  ) {
    return null;
  }

  return totalCents;
}

/**
 * Serializes integer cents into a clean canonical decimal PEN string,
 * removing unnecessary trailing decimal zeros.
 *
 * Examples:
 * 10000 cents -> "100"
 * 10090 cents -> "100.9"
 * 10099 cents -> "100.99"
 */
export function formatCentsToPenDecimal(cents: number): string {
  const intPart = Math.floor(cents / 100);
  const decPart = cents % 100;

  if (decPart === 0) {
    return String(intPart);
  }

  if (decPart % 10 === 0) {
    return `${intPart}.${decPart / 10}`;
  }

  const decPadded = decPart < 10 ? `0${decPart}` : String(decPart);
  return `${intPart}.${decPadded}`;
}
