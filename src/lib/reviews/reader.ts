import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productReviews } from "@/db/schema";
import { cacheCatalogQuery } from "@/lib/catalog/catalog-cache";
import { logger } from "@/lib/logger";
import { EMPTY_REVIEW_SUMMARY, type PublicReview, type ReviewSummary } from "./types";

/** Reviews listed on the product page, newest first. */
export const PRODUCT_PAGE_REVIEW_LIMIT = 20;

const queryApprovedReviews = cacheCatalogQuery(
  "product-reviews",
  async (productId: string): Promise<{ reviews: PublicReview[]; summary: ReviewSummary }> => {
    const approved = and(
      eq(productReviews.productId, productId),
      eq(productReviews.status, "APPROVED")
    );

    const [rows, counts] = await Promise.all([
      db
        .select({
          id: productReviews.id,
          rating: productReviews.rating,
          title: productReviews.title,
          body: productReviews.body,
          authorName: productReviews.authorName,
          createdAt: productReviews.createdAt,
        })
        .from(productReviews)
        .where(approved)
        .orderBy(desc(productReviews.createdAt))
        .limit(PRODUCT_PAGE_REVIEW_LIMIT),
      db
        .select({
          rating: productReviews.rating,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(productReviews)
        .where(approved)
        .groupBy(productReviews.rating),
    ]);

    return {
      reviews: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      summary: summarizeRatingCounts(counts),
    };
  }
);

/** Average, total and per-star counts from `{ rating, count }` rows. */
export function summarizeRatingCounts(
  counts: readonly { rating: number; count: number }[]
): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
  for (const row of counts) {
    const index = row.rating - 1;
    if (index >= 0 && index < 5) distribution[index] = (distribution[index] ?? 0) + row.count;
  }
  const count = distribution.reduce((sum, value) => sum + value, 0);
  const total = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0);
  return {
    average: count > 0 ? Math.round((total / count) * 10) / 10 : null,
    count,
    distribution,
  };
}

/**
 * Approved reviews and their rating for a product page. Fail-soft: until the reviews migration
 * runs, or if the read fails, the page renders without reviews instead of failing.
 */
export async function getApprovedProductReviews(
  productId: string
): Promise<{ reviews: PublicReview[]; summary: ReviewSummary }> {
  try {
    return await queryApprovedReviews(productId);
  } catch {
    logger.warn({ event: "product_reviews_read_failed", productId });
    return { reviews: [], summary: EMPTY_REVIEW_SUMMARY };
  }
}
