"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productReviews } from "@/db/schema";
import type { ActionResult } from "@/lib/admin/catalog/actions";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { logger } from "@/lib/logger";

const moderateSchema = z.object({
  reviewId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

/**
 * Approves or rejects a review. Any review can be moderated again (an approved one can be taken
 * down), and the product page refreshes because its rating and list read approved reviews.
 */
export async function moderateReviewAction(input: unknown): Promise<ActionResult<null>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }
  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Solicitud inválida.", code: "INVALID" };

  try {
    const updated = await db
      .update(productReviews)
      .set({
        status: parsed.data.decision,
        moderatedAt: new Date(),
        moderatedBy: authContext.authUserId,
      })
      .where(eq(productReviews.id, parsed.data.reviewId))
      .returning({ id: productReviews.id });

    if (updated.length === 0) {
      return { success: false, error: "La reseña ya no existe.", code: "NOT_FOUND" };
    }
    revalidateStorefrontCatalog();
    return { success: true, data: null };
  } catch {
    logger.error({ event: "review_moderation_failed" });
    return {
      success: false,
      error: "No se pudo guardar la decisión. Intenta de nuevo.",
      code: "SYSTEM_ERROR",
    };
  }
}
