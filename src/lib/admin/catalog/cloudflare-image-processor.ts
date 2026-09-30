import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { canonicalImageMime, type ImageProcessor } from "./image-processor";

/** The subset of the Workers Images binding the catalog uses. */
interface ImagesBinding {
  info(
    stream: ReadableStream<Uint8Array>
  ): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
  input(stream: ReadableStream<Uint8Array>): {
    output(options: { format: "image/webp"; quality?: number; anim?: boolean }): Promise<{
      response(): Response;
    }>;
  };
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  // Blob only accepts views over a plain ArrayBuffer; the copy is bounded by the 10 MiB cap.
  return new Blob([new Uint8Array(bytes)]).stream();
}

async function getImagesBinding(): Promise<ImagesBinding> {
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as { IMAGES?: ImagesBinding }).IMAGES;
  if (!binding) {
    throw new Error("The Cloudflare Images binding IMAGES is not configured.");
  }
  return binding;
}

/**
 * Cloudflare Images applies EXIF orientation automatically and always discards metadata for WebP
 * output; `anim: false` keeps only the first frame, matching a still product photo.
 */
export const cloudflareImageProcessor: ImageProcessor = {
  async inspect(bytes) {
    const images = await getImagesBinding();
    const info = await images.info(toStream(bytes));
    if (!info.width || !info.height) {
      throw new Error("The image has no decodable dimensions.");
    }
    return { mimeType: canonicalImageMime(info.format), width: info.width, height: info.height };
  },

  async encodeWebp(bytes, { quality }) {
    const images = await getImagesBinding();
    const result = await images
      .input(toStream(bytes))
      .output({ format: "image/webp", quality, anim: false });
    return new Uint8Array(await result.response().arrayBuffer());
  },
};
