"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, productVariants, productMedia } from "@/db/schema";
import { requirePermission } from "@/lib/auth/rbac";
import { productEditorVersion } from "./editor-version";
export async function getProductEditorVersionAction(rawId: unknown) {
  await requirePermission("catalog:manage");
  const productId = z.string().uuid().parse(rawId);
  const [[product], variants, media] = await Promise.all([
    db
      .select({ updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1),
    db
      .select({ id: productVariants.id, updatedAt: productVariants.updatedAt })
      .from(productVariants)
      .where(eq(productVariants.productId, productId)),
    db
      .select({
        id: productMedia.id,
        variantId: productMedia.variantId,
        mediaAssetId: productMedia.mediaAssetId,
        createdAt: productMedia.createdAt,
      })
      .from(productMedia)
      .where(eq(productMedia.productId, productId)),
  ]);
  return product ? productEditorVersion(product, variants, media) : null;
}
