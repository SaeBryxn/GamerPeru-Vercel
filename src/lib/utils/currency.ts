/**
 * Gamer Perú — Currency Formatter Utility
 *
 * All monetary values in the Gamer Perú database are stored strictly as integer
 * minor units (cents, PEN). This utility formats integer cents into canonical
 * Peruvian Soles display strings ("S/ 129.90") without floating-point drift.
 */

/**
 * Formats integer cents into canonical "S/ XX.XX" Peruvian currency string.
 *
 * @param cents Integer amount in cents (e.g. 12990 -> "S/ 129.90")
 * @returns Formatted Soles string
 */
export function formatCurrency(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "S/ 0.00";
  }

  const isNegative = cents < 0;
  const absCents = Math.abs(Math.trunc(cents));
  const soles = Math.floor(absCents / 100);
  const remainder = absCents % 100;
  const formattedCents = remainder.toString().padStart(2, "0");

  const formattedSoles = soles.toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const sign = isNegative ? "-" : "";
  return `${sign}S/ ${formattedSoles}.${formattedCents}`;
}
