/**
 * Gamer Perú — Pagination Utilities
 *
 * Enforces 1-indexed, deterministic pagination bounds and URL parameter parsing.
 */

export const CATALOG_PAGE_SIZE = 12;

export interface ParsedPageParam {
  page: number;
  isInvalid: boolean;
  isExplicitPageOne: boolean;
}

/**
 * Parses and validates the raw `page` query parameter from the URL.
 *
 * Rules:
 * - Undefined/empty: returns page = 1, isInvalid = false, isExplicitPageOne = false.
 * - Exact "1": returns page = 1, isInvalid = false, isExplicitPageOne = true (should redirect to clean base URL).
 * - Non-integer, <= 0, NaN, Infinity, or array: returns page = 1, isInvalid = true (should redirect to canonical page 1).
 * - Valid integer >= 2: returns page = N, isInvalid = false, isExplicitPageOne = false.
 */
export function parsePageParam(rawPage: string | string[] | undefined): ParsedPageParam {
  if (rawPage === undefined || rawPage === null || rawPage === "") {
    return {
      page: 1,
      isInvalid: false,
      isExplicitPageOne: false,
    };
  }

  // Reject array parameters (e.g. ?page=1&page=2)
  if (Array.isArray(rawPage)) {
    return {
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    };
  }

  const trimmed = rawPage.trim();
  if (trimmed === "1") {
    return {
      page: 1,
      isInvalid: false,
      isExplicitPageOne: true,
    };
  }

  // Must match standard integer digits strictly
  if (!/^\d+$/.test(trimmed)) {
    return {
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return {
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    };
  }

  return {
    page: parsed,
    isInvalid: false,
    isExplicitPageOne: false,
  };
}

export interface PaginationBounds {
  totalPages: number;
  isOutOfBounds: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function getPaginationBounds(
  totalItems: number,
  page: number,
  pageSize: number = CATALOG_PAGE_SIZE
): PaginationBounds {
  const totalPages = Math.ceil(totalItems / pageSize);
  const isOutOfBounds = totalItems > 0 && page > totalPages;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1 && !isOutOfBounds;

  return {
    totalPages,
    isOutOfBounds,
    hasNextPage,
    hasPrevPage,
  };
}
