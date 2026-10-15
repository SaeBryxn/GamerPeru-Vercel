/** Structural subset of a specification field, so both DB rows and UI DTOs fit. */
interface WeightSpecCandidate {
  key: string;
  label: string;
  dataType: string;
  unit?: string;
}

const WEIGHT_KEY_PATTERN = /^(weight|peso)(_|$)/i;

/**
 * The category's product-weight specification, if its schema declares one. When it exists the
 * technical sheet is the single place to edit weight (it also drives the storefront filter), and
 * the per-variant weight stops being asked for.
 */
export function findWeightSpecField<T extends WeightSpecCandidate>(
  fieldDefinitions: readonly T[] | null | undefined
): T | undefined {
  return fieldDefinitions?.find(
    (field) => field.dataType === "number" && WEIGHT_KEY_PATTERN.test(field.key)
  );
}

export function hasSpecWeight(
  fieldDefinitions: readonly WeightSpecCandidate[] | null | undefined,
  specValues: Record<string, unknown> | null | undefined
): boolean {
  const field = findWeightSpecField(fieldDefinitions);
  if (!field) return false;
  const value = specValues?.[field.key];
  return value !== undefined && value !== null && value !== "";
}
