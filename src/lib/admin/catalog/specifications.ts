import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { validateSpecificationFieldDefinitions } from "@/lib/discovery-filters/schema-validation";
import type { CategorySpecificationSchema, SpecificationFieldDefinition } from "@/db/schema";
import { CatalogDomainError, SpecificationSchemaIntegrityError } from "./types";

export interface SpecificationValidationResult {
  success: boolean;
  specValues?: Record<string, string | number | boolean>;
  error?: string;
  code?: string;
  field?: string;
}

/**
 * Expands scientific exponent notation (e.g. "1e-5", "2.5e-3", "1.2e+4") into a standard decimal string.
 */
export function expandScientificNotation(numStr: string): string {
  if (!numStr.includes("e") && !numStr.includes("E")) {
    return numStr;
  }

  const isNegative = numStr.startsWith("-");
  const cleanStr = isNegative ? numStr.slice(1) : numStr;

  const parts = cleanStr.toLowerCase().split("e");
  const coefficient = parts[0] ?? "";
  const exponentStr = parts[1] ?? "";
  const exponent = parseInt(exponentStr, 10);
  if (Number.isNaN(exponent) || !coefficient) return numStr;

  const coeffParts = coefficient.split(".");
  const whole = coeffParts[0] ?? "0";
  const fraction = coeffParts[1] ?? "";
  let result: string;

  if (exponent > 0) {
    if (fraction.length <= exponent) {
      result = whole + fraction + "0".repeat(exponent - fraction.length);
    } else {
      result = whole + fraction.slice(0, exponent) + "." + fraction.slice(exponent);
    }
  } else if (exponent < 0) {
    const absExp = Math.abs(exponent);
    result = "0." + "0".repeat(absExp - 1) + whole + fraction;
  } else {
    result = coefficient;
  }

  return isNegative ? `-${result}` : result;
}

/**
 * Determines the number of decimal digits in a decimal string representation of a number.
 */
export function getDecimalPlaces(num: number): number {
  const str = expandScientificNotation(num.toString());
  const parts = str.split(".");
  return parts[1] ? parts[1].length : 0;
}

/**
 * Converts a decimal string to a BigInt scaled by targetScale decimal places.
 */
export function toScaledBigInt(num: number, targetScale: number): bigint {
  const str = expandScientificNotation(num.toString());
  const isNegative = str.startsWith("-");
  const cleanStr = isNegative ? str.slice(1) : str;

  const parts = cleanStr.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const fractionPadded = fraction.padEnd(targetScale, "0").slice(0, targetScale);

  const rawBigInt =
    BigInt(whole) * 10n ** BigInt(targetScale) + (fractionPadded ? BigInt(fractionPadded) : 0n);
  return isNegative ? -rawBigInt : rawBigInt;
}

/**
 * Scales value, base, and step to BigInt with uniform scale for exact integer arithmetic.
 */
export function decimalToIntegerAndScale(
  value: number,
  base: number,
  step: number
): { valueInt: bigint; baseInt: bigint; stepInt: bigint; scale: number } {
  const scale = Math.max(getDecimalPlaces(value), getDecimalPlaces(base), getDecimalPlaces(step));
  return {
    valueInt: toScaledBigInt(value, scale),
    baseInt: toScaledBigInt(base, scale),
    stepInt: toScaledBigInt(step, scale),
    scale,
  };
}

/**
 * Validates that (value - base) is an exact integer multiple of step using deterministic decimal rational normalization.
 *
 * Rules:
 * - base = min ?? 0
 * - (value - base) must be an exact integer multiple of step
 * - Zero floating-point modulo or epsilon threshold
 */
export function validateDeterministicNumberStep(
  value: number,
  step: number,
  min?: number
): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return false;
  }

  const base = min !== undefined && Number.isFinite(min) ? min : 0;
  const { valueInt, baseInt, stepInt } = decimalToIntegerAndScale(value, base, step);

  if (stepInt <= 0n) {
    return false;
  }

  return (valueInt - baseInt) % stepInt === 0n;
}

/**
 * Validates product specification values against an authoritative array of SpecificationFieldDefinition.
 *
 * Requirements:
 * 1. rawSpecValues must be a plain JSON object.
 * 2. Strict Key Allowlist: Every persisted key must match a declared field.key in fieldDefinitions. Unknown keys reject.
 * 3. Typed non-null value validation:
 *    - "enum": string matching one declared options[].value
 *    - "boolean": boolean
 *    - "string": string
 *    - "number": finite number, min/max checks, deterministic step validation
 * 4. null or undefined values are treated as unset and omitted from the returned specValues.
 * 5. No invented required fields (missing keys are permitted).
 */
export function validateProductSpecificationValues(
  fieldDefinitions: SpecificationFieldDefinition[],
  rawSpecValues: unknown
): SpecificationValidationResult {
  if (!rawSpecValues || typeof rawSpecValues !== "object" || Array.isArray(rawSpecValues)) {
    return {
      success: false,
      error: "Las especificaciones técnicas deben ser un objeto JSON.",
      code: "INVALID_SPEC_VALUES_TYPE",
    };
  }

  const fieldMap = new Map<string, SpecificationFieldDefinition>();
  for (const field of fieldDefinitions) {
    fieldMap.set(field.key, field);
  }

  const inputObj = rawSpecValues as Record<string, unknown>;
  const cleanSpecValues: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(inputObj)) {
    // Treat null / undefined as unset
    if (value === null || value === undefined) {
      continue;
    }

    const fieldDef = fieldMap.get(key);
    if (!fieldDef) {
      return {
        success: false,
        error: `La especificación "${key}" no está permitida para esta categoría.`,
        code: "UNKNOWN_SPECIFICATION_KEY",
        field: key,
      };
    }

    switch (fieldDef.dataType) {
      case "enum": {
        if (typeof value !== "string") {
          return {
            success: false,
            error: `La especificación "${fieldDef.label}" debe ser una opción de texto.`,
            code: "INVALID_ENUM_TYPE",
            field: key,
          };
        }
        const validOption = fieldDef.options?.some((opt) => opt.value === value);
        if (!validOption) {
          return {
            success: false,
            error: `El valor "${value}" no es una opción válida para "${fieldDef.label}".`,
            code: "INVALID_ENUM_OPTION",
            field: key,
          };
        }
        cleanSpecValues[key] = value;
        break;
      }

      case "boolean": {
        if (typeof value !== "boolean") {
          return {
            success: false,
            error: `La especificación "${fieldDef.label}" debe ser un valor booleano (verdadero o falso).`,
            code: "INVALID_BOOLEAN_TYPE",
            field: key,
          };
        }
        cleanSpecValues[key] = value;
        break;
      }

      case "string": {
        if (typeof value !== "string") {
          return {
            success: false,
            error: `La especificación "${fieldDef.label}" debe ser una cadena de texto.`,
            code: "INVALID_STRING_TYPE",
            field: key,
          };
        }
        cleanSpecValues[key] = value.trim();
        break;
      }

      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return {
            success: false,
            error: `La especificación "${fieldDef.label}" debe ser un número válido.`,
            code: "INVALID_NUMBER_TYPE",
            field: key,
          };
        }

        if (fieldDef.min !== undefined && value < fieldDef.min) {
          return {
            success: false,
            error: `El valor de "${fieldDef.label}" no puede ser menor a ${fieldDef.min}.`,
            code: "NUMBER_BELOW_MIN",
            field: key,
          };
        }

        if (fieldDef.max !== undefined && value > fieldDef.max) {
          return {
            success: false,
            error: `El valor de "${fieldDef.label}" no puede ser mayor a ${fieldDef.max}.`,
            code: "NUMBER_ABOVE_MAX",
            field: key,
          };
        }

        if (fieldDef.step !== undefined) {
          const stepValid = validateDeterministicNumberStep(value, fieldDef.step, fieldDef.min);
          if (!stepValid) {
            return {
              success: false,
              error: `El valor de "${fieldDef.label}" debe incrementarse en múltiplos exactos de ${fieldDef.step}.`,
              code: "INVALID_STEP_VALUE",
              field: key,
            };
          }
        }

        cleanSpecValues[key] = value;
        break;
      }

      default:
        return {
          success: false,
          error: `Tipo de dato desconocido para la especificación "${key}".`,
          code: "UNKNOWN_SPEC_DATA_TYPE",
          field: key,
        };
    }
  }

  return {
    success: true,
    specValues: cleanSpecValues,
  };
}

export interface AuthoritativeSpecificationSchemaResult {
  hasSchema: boolean;
  schema: CategorySpecificationSchema | null;
}

/**
 * Resolves the authoritative current specification schema for a Category.
 * Strict rules:
 * 1. Read category.current_spec_schema_id.
 * 2. If NULL, return { hasSchema: false, schema: null }.
 * 3. If non-null, load EXACTLY that schema ID.
 * 4. Require:
 *    - schema.id === category.current_spec_schema_id
 *    - schema.category_id === category.id
 *    - schema.is_active === true
 *    - schema.schema_version > 0
 * 5. Run validateSpecificationFieldDefinitions(schema.field_definitions, { categoryId, schemaId }).
 * 6. If validation returns null -> FAIL CLOSED with SPECIFICATION_SCHEMA_INTEGRITY_ERROR.
 */
export async function resolveAuthoritativeCategorySpecificationSchema(
  categoryId: string,
  executor: { execute: (query: SQLWrapper) => Promise<unknown> } = db
): Promise<AuthoritativeSpecificationSchemaResult> {
  const catRows = (await executor.execute(sql`
    SELECT id, current_spec_schema_id FROM categories WHERE id = ${categoryId}::uuid LIMIT 1;
  `)) as { id: string; current_spec_schema_id: string | null }[];

  if (!catRows[0]) {
    throw new CatalogDomainError("La categoría seleccionada no existe.", "INVALID_CATEGORY", 404);
  }

  const currentSpecSchemaId = catRows[0].current_spec_schema_id;
  if (!currentSpecSchemaId) {
    return { hasSchema: false, schema: null };
  }

  const schemaRows = (await executor.execute(sql`
    SELECT id, category_id, schema_version, field_definitions, is_active, created_at
    FROM category_specification_schemas
    WHERE id = ${currentSpecSchemaId}::uuid
    LIMIT 1;
  `)) as {
    id: string;
    category_id: string;
    schema_version: number;
    field_definitions: unknown;
    is_active: boolean;
    created_at: string | Date;
  }[];

  const rawSchema = schemaRows[0];
  if (!rawSchema) {
    throw new SpecificationSchemaIntegrityError(
      "El esquema de especificaciones referenciado por la categoría no existe."
    );
  }

  if (
    rawSchema.id !== currentSpecSchemaId ||
    rawSchema.category_id !== categoryId ||
    !rawSchema.is_active ||
    rawSchema.schema_version <= 0
  ) {
    throw new SpecificationSchemaIntegrityError(
      "El esquema de especificaciones de la categoría no es íntegro, no coincide con la categoría o está inactivo."
    );
  }

  const validatedFields = validateSpecificationFieldDefinitions(rawSchema.field_definitions, {
    categoryId,
    schemaId: currentSpecSchemaId,
  });

  if (!validatedFields) {
    throw new SpecificationSchemaIntegrityError(
      "Las definiciones de campos del esquema de especificaciones son inválidas o están malformadas."
    );
  }

  const schema: CategorySpecificationSchema = {
    id: String(rawSchema.id),
    categoryId: String(rawSchema.category_id),
    schemaVersion: Number(rawSchema.schema_version),
    fieldDefinitions: validatedFields as unknown as SpecificationFieldDefinition[],
    isActive: Boolean(rawSchema.is_active),
    createdAt: new Date(String(rawSchema.created_at)),
  };

  return { hasSchema: true, schema };
}
