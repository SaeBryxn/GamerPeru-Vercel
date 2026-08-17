import { MAX_SEARCH_QUERY_LENGTH } from "./types";

/**
 * Normalizes a raw search query for canonical handling:
 * 1. Unicode NFC normalization.
 * 2. Trims leading/trailing whitespace.
 * 3. Collapses multiple internal whitespace characters into a single standard space.
 * 4. Bounds the length to MAX_SEARCH_QUERY_LENGTH (100) Unicode-visible characters.
 * 5. Preserves user-visible casing (does NOT lowercase).
 */
export function normalizeSearchQuery(raw: string): string {
  if (!raw) return "";

  // 1. NFC normalization
  const nfc = raw.normalize("NFC");

  // 2. Collapse internal whitespace and trim outer
  const collapsed = nfc.replace(/\s+/g, " ").trim();

  // 3. Bound to MAX_SEARCH_QUERY_LENGTH Unicode characters safely
  const chars = Array.from(collapsed);
  if (chars.length <= MAX_SEARCH_QUERY_LENGTH) {
    return collapsed;
  }

  return chars.slice(0, MAX_SEARCH_QUERY_LENGTH).join("").trim();
}

/**
 * Escapes special PostgreSQL LIKE / ILIKE wildcard characters.
 * Escapes: `\`, `%`, `_`
 *
 * MUST be used with `ESCAPE '\'` in PostgreSQL queries.
 * MUST NOT be passed into exact equality or pg_trgm similarity functions.
 */
export function escapeLikePattern(normalized: string): string {
  if (!normalized) return "";
  return normalized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Extracts and normalizes the search query from Next.js searchParams.
 * Handles `string`, `string[]`, or `undefined`.
 * Selects the FIRST non-empty normalized query candidate.
 */
export function parseSearchQueryParam(param: string | string[] | undefined): string {
  if (!param) return "";

  if (Array.isArray(param)) {
    for (const item of param) {
      const normalized = normalizeSearchQuery(item);
      if (normalized.length > 0) {
        return normalized;
      }
    }
    return "";
  }

  return normalizeSearchQuery(param);
}

/**
 * Validates whether a page parameter is syntactically a strictly positive integer string.
 */
export function isSyntacticallyValidPage(param: string | string[] | undefined): boolean {
  if (!param) return false;
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return false;
  return /^[1-9]\d*$/.test(raw.trim());
}

/**
 * Parses the page parameter from Next.js searchParams into a positive integer.
 * Defaults to 1 for invalid or missing page inputs.
 */
export function parsePageParam(param: string | string[] | undefined): number {
  if (!param) return 1;
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return 1;
  const parsed = parseInt(raw.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 1 || !Number.isSafeInteger(parsed)) {
    return 1;
  }
  return parsed;
}
