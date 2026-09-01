/**
 * Validates and normalizes order cancellation reasons.
 *
 * Invariants:
 * 1. Rejects Unicode control (\p{Cc}), format/invisible/bidi (\p{Cf}), line separators (\p{Zl}), and paragraph separators (\p{Zp}).
 * 2. Trims leading/trailing whitespace.
 * 3. Max length: 255 characters. Default fallback: "Cancelado por el cliente" or "Cancelado por el administrador".
 */
export function validateCancelReason(
  raw: string | undefined,
  defaultReason = "Cancelado por el cliente"
): { valid: true; normalized: string } | { valid: false; error: string } {
  if (raw === undefined || raw === null) {
    return { valid: true, normalized: defaultReason };
  }

  if (typeof raw !== "string") {
    return { valid: false, error: "El motivo de cancelación debe ser una cadena de texto." };
  }

  if (raw.trim() === "") {
    return { valid: true, normalized: defaultReason };
  }

  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(raw)) {
    return {
      valid: false,
      error: "El motivo de cancelación contiene caracteres invisibles o de control no permitidos.",
    };
  }

  const trimmed = raw.trim();
  if (trimmed.length > 255) {
    return { valid: false, error: "El motivo de cancelación no puede exceder 255 caracteres." };
  }

  return { valid: true, normalized: trimmed.length > 0 ? trimmed : defaultReason };
}

/**
 * Validates refund amount in integer cents.
 */
export function validateRefundAmountCents(
  raw: unknown
): { valid: true; amountCents: number } | { valid: false; error: string } {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { valid: false, error: "El monto del reembolso debe ser un número entero de céntimos." };
  }

  if (raw <= 0) {
    return { valid: false, error: "El monto del reembolso debe ser mayor a 0 céntimos." };
  }

  return { valid: true, amountCents: raw };
}

/**
 * Validates and normalizes optional refund external reference (e.g. bank operation code).
 */
export function validateRefundExternalReference(
  raw: unknown
): { valid: true; normalized: string | null } | { valid: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { valid: true, normalized: null };
  }

  if (typeof raw !== "string") {
    return { valid: false, error: "La referencia externa debe ser una cadena de texto." };
  }

  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(raw)) {
    return {
      valid: false,
      error: "La referencia externa contiene caracteres invisibles o de control no permitidos.",
    };
  }

  const trimmed = raw.trim();
  if (trimmed.length > 100) {
    return { valid: false, error: "La referencia externa no puede exceder 100 caracteres." };
  }

  return { valid: true, normalized: trimmed.length > 0 ? trimmed : null };
}
