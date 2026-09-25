import type { SpecificationFieldDefinition } from "@/db/schema";

export interface ProductCardSpec {
  /** The schema field key, which picks the spec's icon. */
  key: string;
  label: string;
  value: string;
}

/** How many specs a card can show before it stops being a glance. */
export const MAX_CARD_SPECS = 4;

function formatSpecValue(
  field: SpecificationFieldDefinition,
  raw: string | number | boolean
): string | null {
  if (field.dataType === "boolean") {
    return raw === true ? "Sí" : raw === false ? "No" : null;
  }

  if (field.dataType === "enum") {
    const option = field.options?.find((o) => o.value === raw);
    return option?.label ?? (typeof raw === "string" ? raw : null);
  }

  if (field.dataType === "number") {
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numeric)) return null;
    // Trailing zeros read as noise on a card: 49.0 g is just 49 g.
    const formatted = Number.isInteger(numeric) ? String(numeric) : String(Number(numeric));
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }

  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return null;
}

/**
 * Resolves a product's stored specification values into card labels using its category schema.
 *
 * Only values the operator actually filled are returned, in the schema's declared display order,
 * so a card never shows a technical claim the catalog does not hold.
 */
export function buildProductCardSpecs(
  specValues: Record<string, unknown> | null | undefined,
  fieldDefinitions: SpecificationFieldDefinition[] | null | undefined
): ProductCardSpec[] {
  if (!specValues || !fieldDefinitions || fieldDefinitions.length === 0) return [];

  return [...fieldDefinitions]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .flatMap((field) => {
      const raw = specValues[field.key];
      if (raw === null || raw === undefined) return [];
      if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") return [];

      const value = formatSpecValue(field, raw);
      return value ? [{ key: field.key, label: field.label, value }] : [];
    })
    .slice(0, MAX_CARD_SPECS);
}
