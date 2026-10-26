"use server";

import { z } from "zod";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { getAdminProductDetail } from "./readers";
import { sanitizeProductDetailForUi } from "./ui-dto";
import type { ActionResult } from "./actions";

export interface QuickProductDetail {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  imageUrl: string | null;
  variants: Array<{
    id: string;
    title: string;
    status: string;
    priceCents: number;
    compareAtPriceCents: number | null;
    updatedAt: string;
    imageUrl: string | null;
  }>;
}

/** Fetch only when the operator opens a product; never load every product detail for the table. */
export async function getQuickProductDetailAction(
  productId: string
): Promise<ActionResult<QuickProductDetail>> {
  const auth = await getVerifiedAuthContext();
  if (auth.status !== "READY" || !auth.permissions.has("catalog:manage"))
    return {
      success: false,
      error: "No tienes permisos para consultar el catálogo.",
      code: "FORBIDDEN",
    };
  if (!z.string().uuid().safeParse(productId).success)
    return { success: false, error: "El producto no es válido." };
  try {
    const raw = await getAdminProductDetail(productId, { authContext: auth });
    if (!raw) return { success: false, error: "El producto ya no está disponible." };
    const detail = sanitizeProductDetailForUi(raw);
    return {
      success: true,
      data: {
        id: detail.product.id,
        name: detail.product.name,
        slug: detail.product.slug,
        brand: detail.brand.name,
        category: detail.category.name,
        status: detail.product.status,
        imageUrl:
          detail.primaryMedia?.publicUrl ??
          detail.media.find((m) => m.variantId === null && m.mediaType === "IMAGE")?.publicUrl ??
          null,
        variants: detail.variants.map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          priceCents: v.priceCents,
          compareAtPriceCents: v.compareAtPriceCents,
          updatedAt: new Date(v.updatedAt).toISOString(),
          imageUrl:
            detail.media.find((m) => m.variantId === v.id && m.mediaType === "IMAGE")?.publicUrl ??
            null,
        })),
      },
    };
  } catch {
    return { success: false, error: "No se pudo cargar el producto. Vuelve a intentar." };
  }
}
