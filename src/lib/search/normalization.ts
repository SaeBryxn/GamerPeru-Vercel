import { MAX_SEARCH_QUERY_LENGTH } from "./types";

export function getQueryCodePointLength(value: string): number {
  if (!value) return 0;
  return Array.from(value).length;
}

export function normalizeSearchQuery(raw: string): string {
  if (!raw) return "";

  const nfc = raw.normalize("NFC");
  const collapsed = nfc.replace(/\s+/g, " ").trim();
  const chars = Array.from(collapsed);

  if (chars.length <= MAX_SEARCH_QUERY_LENGTH) {
    return collapsed;
  }

  return chars.slice(0, MAX_SEARCH_QUERY_LENGTH).join("").trim();
}

export function escapeLikePattern(normalized: string): string {
  if (!normalized) return "";
  return normalized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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

export function isSyntacticallyValidPage(param: string | string[] | undefined): boolean {
  if (!param) return false;
  const items = Array.isArray(param) ? param : [param];
  for (const item of items) {
    if (typeof item === "string" && /^[1-9]\d*$/.test(item.trim())) {
      const parsed = parseInt(item.trim(), 10);
      if (Number.isSafeInteger(parsed) && parsed >= 1) {
        return true;
      }
    }
  }
  return false;
}

export function parsePageParam(param: string | string[] | undefined): number {
  if (!param) return 1;
  const items = Array.isArray(param) ? param : [param];
  for (const item of items) {
    if (typeof item === "string" && /^[1-9]\d*$/.test(item.trim())) {
      const parsed = parseInt(item.trim(), 10);
      if (Number.isSafeInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  }
  return 1;
}
