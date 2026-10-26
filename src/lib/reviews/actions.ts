"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customerProfiles,
  orderItems,
  orders,
  productReviews,
  products,
  productVariants,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { resolveCurrentCustomerId } from "@/lib/wishlist/customer";
import {
  formatReviewAuthor,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  type ReviewEligibility,
  type SubmitReviewResult,
} from "./types";

const productIdSchema = z.string().uuid();

const submitReviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z
    .string()
    .trim()
    .max(REVIEW_TITLE_MAX)
    .transform((value) => value || null),
  body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX),
});

/** A line of one of the customer's fulfilled orders for this product: the proof of purchase. */
async function findFulfilledPurchase(customerId: string, productId: string) {
  const [line] = await db
    .select({ orderItemId: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.status, "FULFILLED"),
        eq(productVariants.productId, productId)
      )
    )
    .limit(1);
  return line ?? null;
}

async function findOwnReview(customerId: string, productId: string) {
  const [review] = await db
    .select({ status: productReviews.status })
    .from(productReviews)
    .where(and(eq(productReviews.customerId, customerId), eq(productReviews.productId, productId)))
    .limit(1);
  return review ?? null;
}

/** Whether the visitor may review this product; read per visitor, since the page is cached. */
export async function getReviewEligibilityAction(input: unknown): Promise<ReviewEligibility> {
  const parsed = productIdSchema.safeParse(input);
  if (!parsed.success) return { state: "NOT_PURCHASED" };

  try {
    const customerId = await resolveCurrentCustomerId();
    if (!customerId) return { state: "ANONYMOUS" };

    const own = await findOwnReview(customerId, parsed.data);
    if (own) return { state: "ALREADY_REVIEWED", status: own.status };

    const purchase = await findFulfilledPurchase(customerId, parsed.data);
    return purchase ? { state: "ELIGIBLE" } : { state: "NOT_PURCHASED" };
  } catch {
    logger.error({ event: "review_eligibility_failed" });
    return { state: "NOT_PURCHASED" };
  }
}

/**
 * Saves the customer's review as PENDING. The customer, the purchase and the author name all come
 * from the server; the caller only sends the product, the stars and the text.
 */
export async function submitReviewAction(input: unknown): Promise<SubmitReviewResult> {
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "INVALID",
      message: `Elige de 1 a 5 estrellas y escribe entre ${REVIEW_BODY_MIN} y ${REVIEW_BODY_MAX} caracteres.`,
    };
  }
  const { productId, rating, title, body } = parsed.data;

  try {
    const customerId = await resolveCurrentCustomerId();
    if (!customerId) {
      return { ok: false, reason: "UNAUTHENTICATED", message: "Inicia sesión para opinar." };
    }

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.status, "PUBLISHED")))
      .limit(1);
    const purchase = product ? await findFulfilledPurchase(customerId, productId) : null;
    if (!purchase) {
      return {
        ok: false,
        reason: "NOT_PURCHASED",
        message: "Solo pueden opinar quienes compraron y recibieron este producto.",
      };
    }

    const [profile] = await db
      .select({ firstName: customerProfiles.firstName, lastName: customerProfiles.lastName })
      .from(customerProfiles)
      .where(eq(customerProfiles.id, customerId))
      .limit(1);

    const inserted = await db
      .insert(productReviews)
      .values({
        productId,
        customerId,
        orderItemId: purchase.orderItemId,
        rating,
        title,
        body,
        authorName: formatReviewAuthor(profile?.firstName ?? "", profile?.lastName ?? ""),
      })
      .onConflictDoNothing()
      .returning({ id: productReviews.id });

    if (inserted.length === 0) {
      return {
        ok: false,
        reason: "ALREADY_REVIEWED",
        message: "Ya enviaste tu opinión sobre este producto.",
      };
    }
    return { ok: true };
  } catch {
    logger.error({ event: "review_submit_failed" });
    return {
      ok: false,
      reason: "ERROR",
      message: "No pudimos guardar tu opinión. Intenta nuevamente.",
    };
  }
}
