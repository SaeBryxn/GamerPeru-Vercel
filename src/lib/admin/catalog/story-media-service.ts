import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, brands, productMedia, products } from "@/db/schema";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  registerDirectUploadAsset,
  requestDirectUpload,
  verifyDirectUpload,
  type DirectUploadOptions,
  type DirectUploadRequest,
} from "@/lib/admin/media/direct-upload-service";
import { CatalogDomainError } from "./types";

/**
 * Story images use the shared direct upload (`direct-upload-service`): the browser PUTs them
 * straight to their final key and they are only registered here, with a product-scoped key and
 * a STORY attachment. Images are resized for display by the image optimizer, so the original
 * can be a heavy banner.
 */

export interface StoryMediaServiceOptions extends DirectUploadOptions {
  authContext?: VerifiedAuthContextReady;
  database?: typeof db;
}

export interface RequestStoryImageUploadInput {
  productId: string;
  mimeType: string;
  fileSizeBytes: number;
}

export type RequestStoryImageUploadResult = DirectUploadRequest;

export interface ConfirmStoryImageUploadInput {
  uploadToken: string;
  /** Measured by the browser; display metadata only, so it is bounds-checked, not trusted. */
  width?: number | null;
  height?: number | null;
}

export interface ConfirmStoryImageUploadResult {
  productStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  productMediaId: string;
  mediaAssetId: string;
  objectKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

async function authorize(options?: StoryMediaServiceOptions): Promise<string> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos suficientes para realizar esta acción.",
        "FORBIDDEN",
        403
      );
    }
    return options.authContext.authUserId;
  }
  return (await requirePermission("catalog:manage")).authUserId;
}

/** Signs a direct-to-bucket upload for one story image at a fresh, product-scoped key. */
export async function requestStoryImageUpload(
  input: RequestStoryImageUploadInput,
  options?: StoryMediaServiceOptions
): Promise<RequestStoryImageUploadResult> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  const [row] = await database
    .select({ productSlug: products.slug, brandSlug: brands.slug })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!row) {
    throw new CatalogDomainError(
      "El producto solicitado no existe o no se encuentra disponible.",
      "PRODUCT_NOT_FOUND",
      404
    );
  }

  return requestDirectUpload(
    {
      purpose: "story_image",
      actorId,
      subjectId: input.productId,
      keyPrefix: `products/${row.brandSlug}/${row.productSlug}/story`,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
    },
    options
  );
}

/**
 * Registers an uploaded story image once the shared check passes (token and HEAD). Idempotent:
 * a repeated confirm for the same key returns the existing attachment.
 */
export async function confirmStoryImageUpload(
  input: ConfirmStoryImageUploadInput,
  options?: StoryMediaServiceOptions
): Promise<ConfirmStoryImageUploadResult> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;
  const token = await verifyDirectUpload(
    { uploadToken: input.uploadToken, purpose: "story_image", actorId },
    options
  );
  const productId = token.subjectId;
  if (!productId) {
    throw new CatalogDomainError(
      "La autorización de subida no indica el producto.",
      "DIRECT_UPLOAD_TOKEN_INVALID",
      400
    );
  }

  return database.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product)
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    const { asset } = await registerDirectUploadAsset(tx, token, input);
    const result = (link: { id: string }) => ({
      productStatus: product.status,
      productMediaId: link.id,
      mediaAssetId: asset.id,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    });

    const [existingLink] = await tx
      .select()
      .from(productMedia)
      .where(and(eq(productMedia.mediaAssetId, asset.id), eq(productMedia.productId, productId)));
    if (existingLink) return result(existingLink);

    const [orderRow] = await tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${productMedia.displayOrder}), -1)` })
      .from(productMedia)
      .where(and(eq(productMedia.productId, productId), eq(productMedia.placement, "STORY")));

    const [link] = await tx
      .insert(productMedia)
      .values({
        productId,
        mediaAssetId: asset.id,
        variantId: null,
        displayOrder: Number(orderRow?.maxOrder ?? -1) + 1,
        placement: "STORY",
      })
      .returning();

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId,
      action: "catalog:media:attach",
      targetType: "product_media",
      targetId: link!.id,
      metadata: {
        product_id: productId,
        placement: "STORY",
        object_key: token.objectKey,
        upload: "direct",
      },
    });

    return result(link!);
  });
}
