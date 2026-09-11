/**
 * Canonical plain-record and string-attribute validation primitives for GP-024.
 */

/**
 * Validates that an unknown value is a true plain record.
 *
 * Accepts:
 * - Objects with `Object.prototype` (e.g. `{}`)
 * - Objects with a `null` prototype (e.g. `Object.create(null)`)
 *
 * Rejects:
 * - Arrays
 * - Date, Map, Set, RegExp
 * - Functions
 * - Custom class instances or objects with other prototype chains
 * - Primitives and null / undefined
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Validates that an unknown value is a canonical plain record where every
 * own enumerable property value is a string.
 *
 * Does not impose arbitrary length limits or non-empty constraints.
 */
export function isValidStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainRecord(value)) {
    return false;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof k !== "string" || typeof v !== "string") {
      return false;
    }
  }
  return true;
}
