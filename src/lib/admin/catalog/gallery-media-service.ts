import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, brands, productMedia, products, productVariants } from "@/db/schema";
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
 * Product gallery photos through the shared direct upload (ADR-013). The browser re-encodes the
 * photo (no EXIF, upright, at most 2000 px) and PUTs it to its final key; the server signs the
 * request and, on confirm, checks the stored object with a HEAD and attaches it to the gallery.
 * No image byte is read, hashed or transformed in the Worker.
 */

export interface GalleryMediaServiceOptions extends DirectUploadOptions {
  authContext?: VerifiedAuthContextReady;
  database?: typeof db;
}

export interface RequestGalleryImageUploadInput {
  productId: string;
  variantId?: string | null;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ConfirmGalleryImageUploadInput {
  uploadToken: string;
  /** Measured by the browser; display metadata only, so it is bounds-checked, not trusted. */
  width?: number | null;
  height?: number | null;
  /** The operator's idempotency id, recorded in the audit event. */
  mutationRequestId?: string | null;
}

export interface ConfirmGalleryImageUploadResult {
  productMediaId: string;
  mediaAssetId: string;
  /** True when this upload was already attached by an earlier confirm. */
  replayed: boolean;
}

async function authorize(options?: GalleryMediaServiceOptions): Promise<string> {
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

type Executor = Pick<typeof db, "select">;

async function assertVariantOfProduct(
  executor: Executor,
  productId: string,
  variantId: string
): Promise<void> {
  const [variant] = await executor
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  if (!variant) {
    throw new CatalogDomainError("La variante solicitada no existe.", "VARIANT_NOT_FOUND", 404);
  }
  if (variant.productId !== productId) {
    throw new CatalogDomainError(
      "La variante no pertenece al producto especificado.",
      "MEDIA_VARIANT_PRODUCT_MISMATCH",
      400
    );
  }
}

/** Signs a direct upload for one gallery photo at a fresh key under the product's folder. */
export async function requestGalleryImageUpload(
  input: RequestGalleryImageUploadInput,
  options?: GalleryMediaServiceOptions
): Promise<DirectUploadRequest> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  const [row] = await database
    .select({ productSlug: products.slug, brandSlug: brands.slug })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!row) {
    throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
  }
  const variantId = input.variantId ?? null;
  if (variantId) await assertVariantOfProduct(database, input.productId, variantId);

  return requestDirectUpload(
    {
      purpose: "gallery_image",
      actorId,
      subjectId: input.productId,
      variantId,
      keyPrefix: `products/${row.brandSlug}/${row.productSlug}`,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
    },
    options
  );
}

/**
 * Attaches a verified upload to the product gallery, after the photos already there and to the
 * variant the upload was signed for. Concurrent attachments to one product are serialized by a
 * row lock; a repeated confirm returns the existing attachment instead of adding another.
 */
export async function confirmGalleryImageUpload(
  input: ConfirmGalleryImageUploadInput,
  options?: GalleryMediaServiceOptions
): Promise<ConfirmGalleryImageUploadResult> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;
  const token = await verifyDirectUpload(
    { uploadToken: input.uploadToken, purpose: "gallery_image", actorId },
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
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) {
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    }
    if (token.variantId) await assertVariantOfProduct(tx, productId, token.variantId);

    const { asset } = await registerDirectUploadAsset(tx, token, input);

    const [existing] = await tx
      .select({ id: productMedia.id })
      .from(productMedia)
      .where(and(eq(productMedia.mediaAssetId, asset.id), eq(productMedia.productId, productId)));
    if (existing) {
      return { productMediaId: existing.id, mediaAssetId: asset.id, replayed: true };
    }

    // Counted within the gallery, so story images never shift gallery positions.
    const [orderRow] = await tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${productMedia.displayOrder}), -1)` })
      .from(productMedia)
      .where(and(eq(productMedia.productId, productId), eq(productMedia.placement, "GALLERY")));

    const [link] = await tx
      .insert(productMedia)
      .values({
        productId,
        mediaAssetId: asset.id,
        variantId: token.variantId,
        displayOrder: Number(orderRow?.maxOrder ?? -1) + 1,
        placement: "GALLERY",
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
        variant_id: token.variantId,
        placement: "GALLERY",
        object_key: token.objectKey,
        upload: "direct",
        mutation_request_id: input.mutationRequestId ?? null,
      },
    });

    return { productMediaId: link!.id, mediaAssetId: asset.id, replayed: false };
  });
}
