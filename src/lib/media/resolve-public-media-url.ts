import { publicEnv } from "@/config/public-env";

/**
 * Pure media URL resolver.
 *
 * Resolves a MediaAsset object key against CDN and Site base URLs.
 *
 * Invariants:
 * 1. Same-origin CDN (e.g. http://localhost:3000/media with site http://localhost:3000)
 *    resolves to a relative same-origin path ("/media/<key>") matching Next.js localPatterns.
 * 2. Remote CDN (e.g. https://media.gamerperu.com with site https://gamerperu.com)
 *    resolves to an absolute URL ("https://media.gamerperu.com/<key>") matching Next.js remotePatterns.
 * 3. Rejects path traversal ("..", "%2e%2e", backslashes).
 * 4. Rejects absolute injection (http://, https://, protocol-relative //, javascript:, data:).
 * 5. Rejects query (?) and hash (#) fragments in object keys.
 * 6. Rejects unprintable/control characters.
 * 7. Returns null if objectKey or URLs are malformed.
 */
export function resolveMediaUrl(
  objectKey: string | null | undefined,
  cdnBaseUrl: string,
  siteBaseUrl: string
): string | null {
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

  try {
    const cdnUrl = new URL(cdnBaseUrl.trim());
    const siteUrl = new URL(siteBaseUrl.trim());

    const cdnPath = cdnUrl.pathname.replace(/\/+$/, "");
    const fullPath = `${cdnPath}/${cleanKey}`.replace(/\/{2,}/g, "/");

    // Same-origin check: returns relative path for Next.js localPatterns
    if (cdnUrl.origin.toLowerCase() === siteUrl.origin.toLowerCase()) {
      return fullPath;
    }

    // Remote origin: returns absolute URL for Next.js remotePatterns
    cdnUrl.pathname = fullPath;
    return cdnUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Gamer Perú — Safe Public Media CDN URL Resolver
 *
 * Resolves a MediaAsset object key into a secure local relative path or absolute remote CDN URL
 * based on validated public environment configuration.
 */
export function resolvePublicMediaUrl(objectKey: string | null | undefined): string | null {
  return resolveMediaUrl(objectKey, publicEnv.NEXT_PUBLIC_CDN_URL, publicEnv.NEXT_PUBLIC_SITE_URL);
}
