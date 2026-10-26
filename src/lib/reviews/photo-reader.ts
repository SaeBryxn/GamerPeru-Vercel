import "server-only";
import { inArray, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

/** Only called with photos of approved reviews, or behind the staff permission gate. */
export async function readReviewPhotos(assetIds: string[]): Promise<Map<string, string>> {
  if (!assetIds.length) return new Map();
  const rows = await db
    .select({ id: mediaAssets.id, objectKey: mediaAssets.objectKey })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, [...new Set(assetIds)]),
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        eq(mediaAssets.mediaType, "IMAGE")
      )
    );
  return new Map(
    rows.flatMap((row) => {
      const url = resolvePublicMediaUrl(row.objectKey);
      return url ? [[row.id, url] as const] : [];
    })
  );
}
