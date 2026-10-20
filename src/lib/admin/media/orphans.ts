import "server-only";
import { and, eq, lt, notExists } from "drizzle-orm";
import { db } from "@/db";
import { homeSectionMedia, mediaAssets, productMedia, products } from "@/db/schema";

export async function listUnreferencedAssets(olderThanDays = 30) {
  const cutoff = new Date(Date.now() - Math.max(0, olderThanDays) * 86400_000);
  return db
    .select({
      id: mediaAssets.id,
      objectKey: mediaAssets.objectKey,
      fileSizeBytes: mediaAssets.fileSizeBytes,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
        lt(mediaAssets.createdAt, cutoff),
        notExists(
          db
            .select({ id: productMedia.id })
            .from(productMedia)
            .where(eq(productMedia.mediaAssetId, mediaAssets.id))
        ),
        notExists(
          db
            .select({ id: homeSectionMedia.mediaAssetId })
            .from(homeSectionMedia)
            .where(eq(homeSectionMedia.mediaAssetId, mediaAssets.id))
        ),
        notExists(
          db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.primaryMediaId, mediaAssets.id))
        )
      )
    );
}
