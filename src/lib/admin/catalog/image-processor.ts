/**
 * Image decoding and re-encoding behind the catalog normalizer. Production runs on Cloudflare
 * Workers, which cannot load native modules such as sharp, so the implementation is injected:
 * the Cloudflare Images binding in the app, a sharp-backed one in tests.
 */
export interface ImageInspection {
  /** MIME type of the decoded container, e.g. "image/png". */
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageProcessor {
  /** Decodes the image header. Rejects when the bytes are not a decodable image. */
  inspect(bytes: Uint8Array): Promise<ImageInspection>;
  /**
   * Re-encodes as lossy WebP with EXIF orientation applied, all metadata dropped and only the
   * first frame of an animation kept.
   */
  encodeWebp(bytes: Uint8Array, options: { quality: number }): Promise<Uint8Array>;
}

/** Canonical MIME for a decoder-reported format ("png", "image/jpg", "image/png"…). */
export function canonicalImageMime(format: string): string {
  const normalized = format.trim().toLowerCase();
  const withPrefix = normalized.includes("/") ? normalized : `image/${normalized}`;
  return withPrefix === "image/jpg" ? "image/jpeg" : withPrefix;
}
