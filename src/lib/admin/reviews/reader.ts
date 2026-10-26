import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productReviews, products, type ReviewStatus } from "@/db/schema";

import { readReviewPhotos } from "@/lib/reviews/photo-reader";

export interface AdminReviewRow {
  photos?: { id: string; url: string }[];
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  createdAt: string;
  product: { name: string; slug: string };
}

const ADMIN_REVIEW_LIMIT = 100;

/** Reviews in one state, newest first; returns null when the reviews table is not migrated yet. */
export async function listReviewsForAdmin(status: ReviewStatus): Promise<AdminReviewRow[] | null> {
  try {
    const rows = await db
      .select({
        id: productReviews.id,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        photoAssetIds: productReviews.photoAssetIds,
        authorName: productReviews.authorName,
        status: productReviews.status,
        orderItemId: productReviews.orderItemId,
        createdAt: productReviews.createdAt,
        productName: products.name,
        productSlug: products.slug,
      })
      .from(productReviews)
      .innerJoin(products, eq(products.id, productReviews.productId))
      .where(eq(productReviews.status, status))
      .orderBy(desc(productReviews.createdAt))
      .limit(ADMIN_REVIEW_LIMIT);

    const photos = await readReviewPhotos(rows.flatMap((row) => row.photoAssetIds));
    return rows.map((row) => ({
      photos: row.photoAssetIds.flatMap((id) =>
        photos.has(id) ? [{ id, url: photos.get(id)! }] : []
      ),
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      authorName: row.authorName,
      status: row.status,
      verifiedPurchase: row.orderItemId !== null,
      createdAt: row.createdAt.toISOString(),
      product: { name: row.productName, slug: row.productSlug },
    }));
  } catch {
    return null;
  }
}
