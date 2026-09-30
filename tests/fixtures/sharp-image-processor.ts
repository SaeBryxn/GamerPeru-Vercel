import sharp from "sharp";
import { canonicalImageMime, type ImageProcessor } from "@/lib/admin/catalog/image-processor";

/**
 * Local stand-in for the Cloudflare Images binding: same contract (EXIF orientation applied,
 * metadata dropped, first frame only), decoded with sharp, which only runs in Node test suites.
 */
export const sharpImageProcessor: ImageProcessor = {
  async inspect(bytes) {
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    const isAvif =
      metadata.mediaType === "image/avif" ||
      (metadata.format === "heif" && metadata.compression === "av1");
    if (!metadata.format || !metadata.width || !metadata.height) {
      throw new Error("The image has no decodable format or dimensions.");
    }
    return {
      mimeType: isAvif ? "image/avif" : canonicalImageMime(metadata.format),
      width: metadata.width,
      height: metadata.height,
    };
  },

  async encodeWebp(bytes, { quality }) {
    const data = await sharp(bytes).rotate().webp({ quality, lossless: false }).toBuffer();
    return new Uint8Array(data);
  },
};
