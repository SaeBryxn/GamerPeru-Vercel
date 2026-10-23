/**
 * Gamer Perú — Inventory Engine Validation (GP-021)
 */

export interface ValidationResult<T> {
  valid: boolean;
  normalized?: T;
  error?: string;
}

export function validatePositiveIntegerQuantity(
  qty: unknown,
  fieldName = "quantity"
): ValidationResult<number> {
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
    return {
      valid: false,
      error: `El campo '${fieldName}' debe ser un número entero positivo mayor a cero.`,
    };
  }
  return { valid: true, normalized: qty };
}

export function validateNonNegativeIntegerQuantity(
  qty: unknown,
  fieldName = "quantity"
): ValidationResult<number> {
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 0) {
    return {
      valid: false,
      error: `El campo '${fieldName}' debe ser un número entero mayor o igual a cero.`,
    };
  }
  return { valid: true, normalized: qty };
}

export function validateNonZeroIntegerDelta(
  delta: unknown,
  fieldName = "deltaQuantity"
): ValidationResult<number> {
  if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
    return {
      valid: false,
      error: `El campo '${fieldName}' debe ser un número entero distinto de cero.`,
    };
  }
  return { valid: true, normalized: delta };
}

export function validateReason(reason: unknown): ValidationResult<string> {
  if (typeof reason !== "string") {
    return {
      valid: false,
      error: "El motivo del movimiento de inventario debe ser una cadena de texto.",
    };
  }

  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "El motivo del movimiento de inventario no puede estar vacío.",
    };
  }

  if (trimmed.length > 255) {
    return {
      valid: false,
      error: "El motivo del movimiento de inventario no puede exceder 255 caracteres.",
    };
  }

  // Reject unprintable/invisible control characters
  if (/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(trimmed)) {
    return {
      valid: false,
      error: "El motivo contiene caracteres de control o invisibles no permitidos.",
    };
  }

  return { valid: true, normalized: trimmed };
}

export function validateReferenceId(ref: unknown): ValidationResult<string> {
  if (typeof ref !== "string") {
    return {
      valid: false,
      error: "La referencia de inventario debe ser una cadena de texto.",
    };
  }

  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "La referencia de inventario no puede estar vacía.",
    };
  }

  if (trimmed.length > 255) {
    return {
      valid: false,
      error: "La referencia de inventario no puede exceder 255 caracteres.",
    };
  }

  return { valid: true, normalized: trimmed };
}

export function validateLocationCode(code: unknown): ValidationResult<string> {
  if (typeof code !== "string") {
    return {
      valid: false,
      error: "El código de ubicación debe ser una cadena de texto.",
    };
  }

  const trimmed = code.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.length > 50) {
    return {
      valid: false,
      error: "El código de ubicación debe tener entre 1 y 50 caracteres.",
    };
  }

  if (!/^[A-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error:
        "El código de ubicación contiene caracteres no permitidos (solo alfanumérico, guiones y guión bajo).",
    };
  }

  return { valid: true, normalized: trimmed };
}

export function validateUuid(id: unknown, fieldName = "id"): ValidationResult<string> {
  if (typeof id !== "string") {
    return {
      valid: false,
      error: `El campo '${fieldName}' debe ser una cadena de texto UUID.`,
    };
  }

  const trimmed = id.trim().toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!uuidRegex.test(trimmed)) {
    return {
      valid: false,
      error: `El campo '${fieldName}' no tiene un formato UUID válido.`,
    };
  }

  return { valid: true, normalized: trimmed };
}

export function validateExpectedPhysicalCount(
  expected: number | undefined,
  actual: number
): string | null {
  if (expected === undefined) return null;
  if (!Number.isInteger(expected) || expected < 0)
    return "La lectura anterior del stock no es válida.";
  return expected === actual
    ? null
    : "El stock físico cambió desde que abriste el formulario. Actualiza las existencias y vuelve a contar antes de guardar.";
}
