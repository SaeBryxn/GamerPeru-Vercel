import { publicEnv } from "@/config/public-env";

/**
 * Gamer Perú — Safe Public Media CDN URL Resolver
 *
 * Resolves a MediaAsset object key into a secure, absolute or relative public CDN URL
 * under NEXT_PUBLIC_CDN_URL.
 *
 * Security Invariants:
 * 1. Rejects path traversal attempts ("..", encoded %2e%2e, backslashes).
 * 2. Rejects absolute injection (http://, https://, protocol-relative //).
 * 3. Rejects query fragments (?) and hash fragments (#) in object keys.
 * 4. Rejects control characters.
 * 5. Returns null if objectKey is invalid, missing, or malformed.
 */
export function resolvePublicMediaUrl(objectKey: string | null | undefined): string | null {
  if (!objectKey || typeof objectKey !== "string") {
    return null;
  }

  // Reject control characters (0x00 - 0x1F, 0x7F) including unprintable whitespace/newlines
  if (/[\x00-\x1F\x7F]/.test(objectKey)) {
    return null;
  }

  const trimmed = objectKey.trim();
  if (!trimmed) {
    return null;
  }

  // Reject backslashes
  if (trimmed.includes("\\")) {
    return null;
  }

  // Reject absolute schemes and protocol-relative prefixes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }

  // Reject query and hash fragments
  if (trimmed.includes("?") || trimmed.includes("#")) {
    return null;
  }

  // Normalize leading slashes
  const cleanKey = trimmed.replace(/^\/+/, "");
  if (!cleanKey) {
    return null;
  }

  // Check for path traversal segments ("." or "..", or encoded variants)
  const segments = cleanKey.split("/");
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (lower === "." || lower === ".." || lower === "%2e" || lower === "%2e%2e") {
      return null;
    }
  }

  const rawCdnUrl = publicEnv.NEXT_PUBLIC_CDN_URL.trim();
  try {
    const cdnBase = new URL(rawCdnUrl);
    // Ensure CDN base ends with a slash and safely resolve path
    const basePath = cdnBase.pathname.endsWith("/") ? cdnBase.pathname : `${cdnBase.pathname}/`;
    cdnBase.pathname = `${basePath}${cleanKey}`.replace(/\/{2,}/g, "/");
    return cdnBase.toString();
  } catch {
    // Fallback string join if URL parser encounters custom relative scheme
    const baseClean = rawCdnUrl.replace(/\/+$/, "");
    return `${baseClean}/${cleanKey}`;
  }
}
