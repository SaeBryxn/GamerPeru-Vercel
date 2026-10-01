import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, brands, mediaAssets, productMedia, products } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { getCatalogMediaIntentSecret } from "@/config/server-env";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { CatalogDomainError } from "./types";
import { R2CatalogStorageAdapter, type CatalogStorageAdapter } from "./media-storage";

/**
 * Story images are uploaded by the browser straight to their final key in the public bucket and
 * are only registered here. Unlike gallery photos, nothing reads, decodes or re-encodes the bytes
 * inside the Worker (that path exceeds the Workers Free CPU budget): the request step signs a
 * URL, the confirm step checks size and type with a HEAD and writes two rows. Images are resized
 * for display by the image optimizer, so the original can be a heavy banner.
 */

export const STORY_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type StoryImageMimeType = (typeof STORY_IMAGE_MIME_TYPES)[number];

export const STORY_IMAGE_MAX_BYTES = 10485760;
const UPLOAD_WINDOW_SECONDS = 15 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const EXTENSIONS: Record<StoryImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const tokenSchema = z
  .object({
    v: z.literal(1),
    actorId: z.string().min(1),
    productId: z.string().uuid(),
    objectKey: z.string().min(1),
    mimeType: z.enum(STORY_IMAGE_MIME_TYPES),
    expiresAt: z.number().int().positive(),
  })
  .strict();

type StoryUploadToken = z.infer<typeof tokenSchema>;

export interface StoryMediaServiceOptions {
  authContext?: VerifiedAuthContextReady;
  storageAdapter?: CatalogStorageAdapter;
  intentSecret?: string;
  nowSeconds?: number;
  database?: typeof db;
}

export interface RequestStoryImageUploadInput {
  productId: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface RequestStoryImageUploadResult {
  uploadToken: string;
  presignedPutUrl: string;
  requiredHeaders: Record<string, string>;
}

export interface ConfirmStoryImageUploadInput {
  uploadToken: string;
  /** Measured by the browser; display metadata only, so it is bounds-checked, not trusted. */
  width?: number | null;
  height?: number | null;
}

export interface ConfirmStoryImageUploadResult {
  productMediaId: string;
  mediaAssetId: string;
  objectKey: string;
  mimeType: StoryImageMimeType;
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

function signToken(token: StoryUploadToken, secret: string): string {
  const body = Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${signature}`;
}

function verifyToken(raw: string, secret: string, nowSeconds: number): StoryUploadToken {
  const invalid = () =>
    new CatalogDomainError(
      "La autorización de subida no es válida. Vuelve a subir la imagen.",
      "STORY_UPLOAD_TOKEN_INVALID",
      400
    );
  const [body, signature] = raw.split(".");
  if (!body || !signature || raw.split(".").length !== 2) throw invalid();

  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"), "hex");
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw invalid();

  let parsed: StoryUploadToken;
  try {
    parsed = tokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    throw invalid();
  }
  if (parsed.expiresAt < nowSeconds) {
    throw new CatalogDomainError(
      "La autorización de subida expiró. Vuelve a subir la imagen.",
      "STORY_UPLOAD_TOKEN_EXPIRED",
      400
    );
  }
  return parsed;
}

function boundedDimension(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20000
    ? value
    : null;
}

/** Signs a direct-to-bucket upload for one story image at a fresh, product-scoped key. */
export async function requestStoryImageUpload(
  input: RequestStoryImageUploadInput,
  options?: StoryMediaServiceOptions
): Promise<RequestStoryImageUploadResult> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  if (!(STORY_IMAGE_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new CatalogDomainError(
      "Formato no admitido para la historia. Usa JPEG, PNG o WebP.",
      "MEDIA_UNSUPPORTED_TYPE",
      400
    );
  }
  if (
    !Number.isInteger(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > STORY_IMAGE_MAX_BYTES
  ) {
    throw new CatalogDomainError(
      "La imagen debe pesar como máximo 10 MB.",
      "MEDIA_SIZE_LIMIT_EXCEEDED",
      400
    );
  }
  const mimeType = input.mimeType as StoryImageMimeType;

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

  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const objectKey = `products/${row.brandSlug}/${row.productSlug}/story/${generateUuidV7()}.${EXTENSIONS[mimeType]}`;
  const uploadToken = signToken(
    {
      v: 1,
      actorId,
      productId: input.productId,
      objectKey,
      mimeType,
      expiresAt: nowSeconds + UPLOAD_WINDOW_SECONDS,
    },
    getCatalogMediaIntentSecret(options?.intentSecret)
  );

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const presignedPutUrl = await adapter.generatePresignedPutUrl({
    bucket: R2_BUCKETS.PUBLIC_MEDIA,
    key: objectKey,
    contentType: mimeType,
    cacheControl: CACHE_CONTROL,
    expiresInSeconds: UPLOAD_WINDOW_SECONDS,
  });

  return {
    uploadToken,
    presignedPutUrl,
    requiredHeaders: { "Content-Type": mimeType, "Cache-Control": CACHE_CONTROL },
  };
}

/**
 * Registers an uploaded story image after checking, by HEAD only, that the object exists with the
 * signed type and within the size limit. Anything else is deleted and rejected. Idempotent: a
 * repeated confirm for the same key returns the existing attachment.
 */
export async function confirmStoryImageUpload(
  input: ConfirmStoryImageUploadInput,
  options?: StoryMediaServiceOptions
): Promise<ConfirmStoryImageUploadResult> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const token = verifyToken(
    input.uploadToken,
    getCatalogMediaIntentSecret(options?.intentSecret),
    nowSeconds
  );
  if (token.actorId !== actorId) {
    throw new CatalogDomainError(
      "Esta subida fue autorizada para otra sesión.",
      "STORY_UPLOAD_ACTOR_MISMATCH",
      403
    );
  }

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const head = await adapter.headObject({ bucket: R2_BUCKETS.PUBLIC_MEDIA, key: token.objectKey });
  if (!head) {
    throw new CatalogDomainError(
      "No encontramos la imagen subida. Vuelve a intentarlo.",
      "STORY_UPLOAD_NOT_FOUND",
      404
    );
  }
  if (
    head.contentLength <= 0 ||
    head.contentLength > STORY_IMAGE_MAX_BYTES ||
    head.contentType !== token.mimeType
  ) {
    await adapter.deleteObject({ bucket: R2_BUCKETS.PUBLIC_MEDIA, key: token.objectKey });
    throw new CatalogDomainError(
      "La imagen subida no coincide con lo autorizado (tipo o tamaño). Vuelve a subirla.",
      "STORY_UPLOAD_MISMATCH",
      422
    );
  }

  const width = boundedDimension(input.width);
  const height = boundedDimension(input.height);

  return database.transaction(async (tx) => {
    const [existingAsset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.objectKey, token.objectKey));
    if (existingAsset) {
      const [existingLink] = await tx
        .select()
        .from(productMedia)
        .where(
          and(
            eq(productMedia.mediaAssetId, existingAsset.id),
            eq(productMedia.productId, token.productId)
          )
        );
      if (existingLink) {
        return {
          productMediaId: existingLink.id,
          mediaAssetId: existingAsset.id,
          objectKey: existingAsset.objectKey,
          mimeType: token.mimeType,
          width: existingAsset.width,
          height: existingAsset.height,
        };
      }
    }

    const [asset] = existingAsset
      ? [existingAsset]
      : await tx
          .insert(mediaAssets)
          .values({
            objectKey: token.objectKey,
            securityClass: "PUBLIC_MEDIA",
            mediaType: "IMAGE",
            mimeType: token.mimeType,
            fileSizeBytes: head.contentLength,
            width,
            height,
          })
          .returning();

    const [orderRow] = await tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${productMedia.displayOrder}), -1)` })
      .from(productMedia)
      .where(and(eq(productMedia.productId, token.productId), eq(productMedia.placement, "STORY")));

    const [link] = await tx
      .insert(productMedia)
      .values({
        productId: token.productId,
        mediaAssetId: asset!.id,
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
        product_id: token.productId,
        placement: "STORY",
        object_key: token.objectKey,
        upload: "direct",
      },
    });

    return {
      productMediaId: link!.id,
      mediaAssetId: asset!.id,
      objectKey: asset!.objectKey,
      mimeType: token.mimeType,
      width: asset!.width,
      height: asset!.height,
    };
  });
}
