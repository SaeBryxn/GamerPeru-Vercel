import "server-only";

import { createHash } from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  products,
  productVariants,
  brands,
  mediaAssets,
  productMedia,
  auditEvents,
  type ProductMedia,
  type MediaAsset,
} from "@/db/schema";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  StaleWriteConflictError,
} from "./types";
import {
  computeMutationRequestDigest,
  computeRequestFingerprint,
  createCatalogAdvisoryLockKey,
} from "./crypto";
import {
  type AllowedMediaUploadMimeType,
  ALLOWED_MEDIA_UPLOAD_MIME_TYPES,
  MAX_MEDIA_FILE_SIZE_BYTES,
  type CatalogMediaUploadIntentPayload,
  signMediaUploadIntent,
  verifyAndParseMediaUploadIntent,
  computeMediaIntentDigest,
  createCatalogMediaIntentAdvisoryLockKey,
} from "./media-crypto";
import { type CatalogStorageAdapter, R2CatalogStorageAdapter } from "./media-storage";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { getCatalogMediaIntentSecret } from "@/config/server-env";
import { validateAndNormalizeCatalogImage } from "./image-normalizer";
import { ALLOWED_IMAGE_MIME_TYPES } from "./publish-readiness";

export interface MediaServiceOptions {
  authContext?: VerifiedAuthContextReady;
  storageAdapter?: CatalogStorageAdapter;
  intentSecret?: string;
  currentServerTimeSeconds?: number;
}

export interface RequestCatalogMediaUploadIntentInput {
  productId: string;
  variantId?: string | null;
  mimeType: AllowedMediaUploadMimeType;
}

export interface RequestCatalogMediaUploadIntentResult {
  signedIntentToken: string;
  presignedPutUrl: string;
  expectedIncomingMimeType: AllowedMediaUploadMimeType;
  maximumBytes: number;
  expiresAt: number;
  requiredHeaders: Record<string, string>;
}

export interface FinalizeCatalogMediaUploadInput {
  signedIntentToken: string;
  mutationRequestId: string;
}

export interface FinalizeCatalogMediaUploadResult {
  productMedia: ProductMedia;
  mediaAsset: MediaAsset;
  replayed: boolean;
}

export interface UpdateMediaAssetAltTextInput {
  productId: string;
  mediaAssetId: string;
  altText: string | null;
  mutationRequestId: string;
}

export interface ReorderProductMediaInput {
  productId: string;
  orderedProductMediaIds: string[];
  mutationRequestId: string;
}

export interface SetProductPrimaryMediaInput {
  productId: string;
  productMediaId: string;
  expectedUpdatedAt?: string | Date;
  mutationRequestId: string;
}

export interface ReassignProductMediaVariantInput {
  productId: string;
  productMediaId: string;
  targetVariantId: string | null;
  mutationRequestId: string;
}

async function assertAuthorizedCaller(
  permission: "catalog:manage",
  options?: MediaServiceOptions
): Promise<{ authUserId: string; email: string | null }> {
  if (options?.authContext) {
    if (
      options.authContext.status !== "READY" ||
      !options.authContext.permissions.has(permission)
    ) {
      throw new CatalogDomainError(
        "No tienes permisos suficientes para realizar esta acción.",
        "FORBIDDEN",
        403
      );
    }
    return {
      authUserId: options.authContext.authUserId,
      email: options.authContext.email,
    };
  }

  const ctx = await requirePermission(permission);
  return {
    authUserId: ctx.authUserId,
    email: ctx.email,
  };
}

/**
 * Service: Issues a stateless, server-signed media upload intent capability and presigned PUT URL.
 * Binds actor, product, optional variant, staging key, expected MIME, and max bytes.
 */
export async function requestCatalogMediaUploadIntent(
  input: RequestCatalogMediaUploadIntentInput,
  options?: MediaServiceOptions
): Promise<RequestCatalogMediaUploadIntentResult> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!ALLOWED_MEDIA_UPLOAD_MIME_TYPES.includes(input.mimeType)) {
    throw new CatalogDomainError(
      "Tipo de archivo no permitido. Solo se aceptan JPEG, PNG, WebP o AVIF.",
      "MEDIA_UNSUPPORTED_TYPE",
      400
    );
  }

  // 1. Authoritative Product Existence Check
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));

  if (!product) {
    throw new CatalogDomainError(
      "El producto solicitado no existe o no se encuentra disponible.",
      "PRODUCT_NOT_FOUND",
      404
    );
  }

  // 2. Authoritative Variant Ownership Binding
  if (input.variantId) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, input.variantId));

    if (!variant) {
      throw new CatalogDomainError("La variante solicitada no existe.", "VARIANT_NOT_FOUND", 404);
    }

    if (variant.productId !== input.productId) {
      throw new CatalogDomainError(
        "La variante no pertenece al producto especificado.",
        "MEDIA_VARIANT_PRODUCT_MISMATCH",
        422
      );
    }
  }

  // 3. Issue Capability Payload
  const intentId = generateUuidV7();
  const now = options?.currentServerTimeSeconds ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds = 600; // 10 minutes
  const expiresAt = now + expiresInSeconds;
  const stagingObjectKey = `temp/catalog/${intentId}`;

  const payload: CatalogMediaUploadIntentPayload = {
    version: 1,
    intentId,
    verifiedActorId: caller.authUserId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    stagingObjectKey,
    expectedIncomingMimeType: input.mimeType,
    maximumBytes: MAX_MEDIA_FILE_SIZE_BYTES,
    issuedAt: now,
    expiresAt,
  };

  const secret = getCatalogMediaIntentSecret(options?.intentSecret);
  const signedIntentToken = signMediaUploadIntent(payload, secret);

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const presignedPutUrl = await adapter.generatePresignedPutUrl({
    bucket: R2_BUCKETS.CATALOG_STAGING,
    key: stagingObjectKey,
    contentType: input.mimeType,
    expiresInSeconds,
  });

  return {
    signedIntentToken,
    presignedPutUrl,
    expectedIncomingMimeType: input.mimeType,
    maximumBytes: MAX_MEDIA_FILE_SIZE_BYTES,
    expiresAt,
    requiredHeaders: {
      "Content-Type": input.mimeType,
    },
  };
}

/**
 * Service: Finalizes a staged media upload, verifies image bytes, converts to canonical WebP,
 * writes to public storage, and records atomic ProductMedia attachment and AuditEvent under dual advisory locks.
 */
export async function finalizeCatalogMediaUpload(
  input: FinalizeCatalogMediaUploadInput,
  options?: MediaServiceOptions
): Promise<FinalizeCatalogMediaUploadResult> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!input.mutationRequestId || input.mutationRequestId.trim() === "") {
    throw new CatalogDomainError(
      "El identificador de solicitud de mutación es obligatorio.",
      "INVALID_MUTATION_REQUEST_ID",
      400
    );
  }

  const secret = getCatalogMediaIntentSecret(options?.intentSecret);
  const payload = verifyAndParseMediaUploadIntent(input.signedIntentToken, secret, {
    currentServerTimeSeconds: options?.currentServerTimeSeconds,
  });

  if (payload.verifiedActorId !== caller.authUserId) {
    throw new CatalogDomainError(
      "El token de subida no pertenece al usuario autenticado actual.",
      "FORBIDDEN",
      403
    );
  }

  // Authoritative Product and Brand Lookup
  const [prodRow] = await db
    .select({ product: products, brand: brands })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.id, payload.productId));

  if (!prodRow) {
    throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
  }

  // Authoritative Variant Ownership Verification
  if (payload.variantId != null) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, payload.variantId));

    if (!variant) {
      throw new CatalogDomainError("La variante solicitada no existe.", "VARIANT_NOT_FOUND", 404);
    }

    if (variant.productId !== payload.productId) {
      throw new CatalogDomainError(
        "La variante no pertenece al producto especificado.",
        "MEDIA_VARIANT_PRODUCT_MISMATCH",
        422
      );
    }
  }

  // Tri-Identity Derivation
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    "catalog:media:attach",
    input.mutationRequestId
  );

  const mediaIntentDigest = computeMediaIntentDigest(payload);

  const requestFingerprint = computeRequestFingerprint({
    op: "catalog:media:attach",
    mediaIntentDigest,
    productId: payload.productId,
    variantId: payload.variantId,
  });

  // EARLY PROBE 1: Mutation Request Replay Probe
  const [existingMutationAudit] = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorId, caller.authUserId),
        eq(auditEvents.action, "catalog:media:attach"),
        sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
      )
    );

  if (existingMutationAudit) {
    const storedFp = (existingMutationAudit.metadata as Record<string, unknown>)
      ?.request_fingerprint;
    if (storedFp !== requestFingerprint) {
      throw new CatalogIdempotencyConflictError();
    }

    const [existingPm] = await db
      .select()
      .from(productMedia)
      .where(eq(productMedia.id, existingMutationAudit.targetId));

    if (!existingPm) {
      throw new CatalogReplayIntegrityError();
    }

    const [existingAsset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, existingPm.mediaAssetId));

    if (!existingAsset) {
      throw new CatalogReplayIntegrityError();
    }

    return { productMedia: existingPm, mediaAsset: existingAsset, replayed: true };
  }

  // EARLY PROBE 2: Media Intent Consumption Probe
  const [existingIntentAudit] = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, "catalog:media:attach"),
        sql`${auditEvents.metadata}->>'media_intent_digest' = ${mediaIntentDigest}`
      )
    );

  if (existingIntentAudit) {
    throw new CatalogDomainError(
      "El intento de subida ya ha sido consumido por otra solicitud.",
      "MEDIA_INTENT_ALREADY_CONSUMED",
      409
    );
  }

  // STAGING OBJECT VERIFICATION & NORMALIZATION
  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const stagingHead = await adapter.headObject({
    bucket: R2_BUCKETS.CATALOG_STAGING,
    key: payload.stagingObjectKey,
  });

  if (!stagingHead || stagingHead.contentLength === 0) {
    throw new CatalogDomainError(
      "El objeto en staging no existe o la subida está incompleta.",
      "MEDIA_STAGING_NOT_FOUND",
      400
    );
  }

  const stagingBytes = await adapter.getObjectBytes({
    bucket: R2_BUCKETS.CATALOG_STAGING,
    key: payload.stagingObjectKey,
  });

  const normalized = await validateAndNormalizeCatalogImage(
    stagingBytes,
    payload.expectedIncomingMimeType
  );

  // Canonical Content-Hashed Key: products/{brandSlug}/{productSlug}/{sha256}.webp
  const canonicalKey = `products/${prodRow.brand.slug}/${prodRow.product.slug}/${normalized.checksumSha256}.webp`;

  // Public Storage Write / Content-Integrity Reuse
  const existingPublicHead = await adapter.headObject({
    bucket: R2_BUCKETS.PUBLIC_MEDIA,
    key: canonicalKey,
  });

  if (existingPublicHead) {
    const existingBytes = await adapter.getObjectBytes({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: canonicalKey,
    });
    const existingHash = createHash("sha256").update(existingBytes).digest("hex");
    if (existingHash !== normalized.checksumSha256) {
      throw new CatalogDomainError(
        "Discrepancia de integridad en el objeto público existente bajo la misma clave canónica.",
        "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        500
      );
    }
  } else {
    await adapter.putObject({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: canonicalKey,
      body: normalized.normalizedWebpBuffer,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
  }

  // DATABASE TRANSACTION WITH DUAL ADVISORY LOCKS
  const result = await db.transaction(async (tx) => {
    // 1. Advisory Lock 1: mutationRequestDigest
    const lockKey1 = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1})`);

    // 2. Advisory Lock 2: mediaIntentDigest
    const lockKey2 = createCatalogMediaIntentAdvisoryLockKey(mediaIntentDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey2})`);

    // Recheck Replay Under Lock
    const [lockedMutationAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, "catalog:media:attach"),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (lockedMutationAudit) {
      const storedFp = (lockedMutationAudit.metadata as Record<string, unknown>)
        ?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }

      const [lockedPm] = await tx
        .select()
        .from(productMedia)
        .where(eq(productMedia.id, lockedMutationAudit.targetId));

      if (!lockedPm) {
        throw new CatalogReplayIntegrityError();
      }

      const [lockedAsset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, lockedPm.mediaAssetId));

      if (!lockedAsset) {
        throw new CatalogReplayIntegrityError();
      }

      return { productMedia: lockedPm, mediaAsset: lockedAsset, replayed: true };
    }

    // Recheck Intent Consumption Under Lock
    const [lockedIntentAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "catalog:media:attach"),
          sql`${auditEvents.metadata}->>'media_intent_digest' = ${mediaIntentDigest}`
        )
      );

    if (lockedIntentAudit) {
      throw new CatalogDomainError(
        "El intento de subida ya ha sido consumido por otra solicitud.",
        "MEDIA_INTENT_ALREADY_CONSUMED",
        409
      );
    }

    // Re-verify Variant Ownership Under Lock
    if (payload.variantId != null) {
      const [txVar] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, payload.variantId));

      if (!txVar || txVar.productId !== payload.productId) {
        throw new CatalogDomainError(
          "La variante no pertenece al producto especificado.",
          "MEDIA_VARIANT_PRODUCT_MISMATCH",
          422
        );
      }
    }

    // Race-Safe MediaAsset Persistence (Handling physical UNIQUE on object_key)
    let asset: MediaAsset;
    const [existingAsset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.objectKey, canonicalKey));

    if (existingAsset) {
      if (existingAsset.checksumSha256 !== normalized.checksumSha256) {
        throw new CatalogDomainError(
          "Discrepancia en checksum de MediaAsset existente.",
          "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
          500
        );
      }
      asset = existingAsset;
    } else {
      try {
        const [inserted] = await tx
          .insert(mediaAssets)
          .values({
            objectKey: canonicalKey,
            securityClass: "PUBLIC_MEDIA",
            mediaType: "IMAGE",
            mimeType: "image/webp",
            fileSizeBytes: normalized.fileSizeBytes,
            width: normalized.width,
            height: normalized.height,
            checksumSha256: normalized.checksumSha256,
          })
          .returning();
        asset = inserted!;
      } catch (err: unknown) {
        // Handle concurrent insert race safely
        const [winner] = await tx
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.objectKey, canonicalKey));

        if (!winner) {
          throw err;
        }

        if (winner.checksumSha256 !== normalized.checksumSha256) {
          throw new CatalogDomainError(
            "Discrepancia en checksum de MediaAsset ganador de carrera.",
            "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
            500
          );
        }
        asset = winner;
      }
    }

    // Compute next display_order for product
    const [orderRow] = await tx
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${productMedia.displayOrder}), -1)`,
      })
      .from(productMedia)
      .where(eq(productMedia.productId, payload.productId));

    const nextDisplayOrder = Number(orderRow?.maxOrder ?? -1) + 1;

    // Insert exactly ONE ProductMedia attachment
    const [insertedPm] = await tx
      .insert(productMedia)
      .values({
        productId: payload.productId,
        mediaAssetId: asset.id,
        variantId: payload.variantId,
        displayOrder: nextDisplayOrder,
      })
      .returning();

    // Insert exactly ONE AuditEvent replay marker
    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action: "catalog:media:attach",
      targetType: "product_media",
      targetId: insertedPm!.id,
      metadata: {
        mutation_request_digest: mutationRequestDigest,
        request_fingerprint: requestFingerprint,
        media_intent_digest: mediaIntentDigest,
        product_id: payload.productId,
        variant_id: payload.variantId,
      },
    });

    return { productMedia: insertedPm!, mediaAsset: asset, replayed: false };
  });

  // Post-Commit Best-Effort Staging Cleanup
  try {
    await adapter.deleteObject({
      bucket: R2_BUCKETS.CATALOG_STAGING,
      key: payload.stagingObjectKey,
    });
  } catch {
    // Non-blocking cleanup failure; attachment is already committed
  }

  return result;
}

/**
 * Service: Updates MediaAsset alt text globally across all referencing products.
 * Idempotent, audited, and strictly validated.
 */
export async function updateMediaAssetAltText(
  input: UpdateMediaAssetAltTextInput,
  options?: MediaServiceOptions
): Promise<{ mediaAsset: MediaAsset; replayed: boolean }> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!input.mutationRequestId || input.mutationRequestId.trim() === "") {
    throw new CatalogDomainError(
      "El identificador de solicitud de mutación es obligatorio.",
      "INVALID_MUTATION_REQUEST_ID",
      400
    );
  }

  // Canonical Alt-Text Validation
  let normalizedAltText: string | null = null;
  if (input.altText !== null && input.altText !== undefined) {
    if (typeof input.altText !== "string") {
      throw new CatalogDomainError(
        "El texto alternativo debe ser una cadena de texto.",
        "INVALID_ALT_TEXT",
        400
      );
    }
    const trimmed = input.altText.trim();
    if (trimmed.length > 255) {
      throw new CatalogDomainError(
        "El texto alternativo no puede exceder 255 caracteres.",
        "INVALID_ALT_TEXT",
        400
      );
    }
    normalizedAltText = trimmed.length > 0 ? trimmed : null;
  }

  // Verify MediaAsset exists and is referenced by the product context
  const [pmRef] = await db
    .select()
    .from(productMedia)
    .where(
      and(
        eq(productMedia.productId, input.productId),
        eq(productMedia.mediaAssetId, input.mediaAssetId)
      )
    );

  if (!pmRef) {
    throw new CatalogDomainError(
      "El activo multimedia no está referenciado por este producto.",
      "MEDIA_ASSET_NOT_FOUND",
      404
    );
  }

  const action = "catalog:media:alt_text";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );

  const requestFingerprint = computeRequestFingerprint({
    op: action,
    productId: input.productId,
    mediaAssetId: input.mediaAssetId,
    altText: normalizedAltText,
  });

  return await db.transaction(async (tx) => {
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // Replay check under lock
    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, action),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      const [existingAsset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, input.mediaAssetId));

      if (!existingAsset) {
        throw new CatalogReplayIntegrityError();
      }
      return { mediaAsset: existingAsset, replayed: true };
    }

    const [updatedAsset] = await tx
      .update(mediaAssets)
      .set({ altText: normalizedAltText })
      .where(eq(mediaAssets.id, input.mediaAssetId))
      .returning();

    if (!updatedAsset) {
      throw new CatalogDomainError("El activo multimedia no existe.", "MEDIA_ASSET_NOT_FOUND", 404);
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action,
      targetType: "media_asset",
      targetId: input.mediaAssetId,
      metadata: {
        mutation_request_digest: mutationRequestDigest,
        request_fingerprint: requestFingerprint,
        product_id: input.productId,
      },
    });

    return { mediaAsset: updatedAsset, replayed: false };
  });
}

/**
 * Service: Atomically reorders ProductMedia rows belonging strictly to the target Product.
 */
export async function reorderProductMedia(
  input: ReorderProductMediaInput,
  options?: MediaServiceOptions
): Promise<{ success: boolean; replayed: boolean }> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!input.mutationRequestId || input.mutationRequestId.trim() === "") {
    throw new CatalogDomainError(
      "El identificador de solicitud de mutación es obligatorio.",
      "INVALID_MUTATION_REQUEST_ID",
      400
    );
  }

  if (!Array.isArray(input.orderedProductMediaIds) || input.orderedProductMediaIds.length === 0) {
    throw new CatalogDomainError(
      "La lista de identificadores para reordenar no puede estar vacía.",
      "INVALID_REORDER_PAYLOAD",
      400
    );
  }

  const uniqueIds = new Set(input.orderedProductMediaIds);
  if (uniqueIds.size !== input.orderedProductMediaIds.length) {
    throw new CatalogDomainError(
      "La lista de identificadores contiene valores duplicados.",
      "INVALID_REORDER_PAYLOAD",
      400
    );
  }

  // Load existing ProductMedia rows for this product
  const currentRows = await db
    .select()
    .from(productMedia)
    .where(eq(productMedia.productId, input.productId));

  const currentMap = new Map(currentRows.map((r) => [r.id, r]));
  if (
    currentRows.length !== input.orderedProductMediaIds.length ||
    !input.orderedProductMediaIds.every((id) => currentMap.has(id))
  ) {
    throw new CatalogDomainError(
      "La lista de medios debe coincidir exactamente con los medios registrados para este producto.",
      "PRODUCT_MEDIA_NOT_FOUND",
      400
    );
  }

  const action = "catalog:media:reorder";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );

  const requestFingerprint = computeRequestFingerprint({
    op: action,
    productId: input.productId,
    orderedProductMediaIds: input.orderedProductMediaIds,
  });

  return await db.transaction(async (tx) => {
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, action),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return { success: true, replayed: true };
    }

    for (let i = 0; i < input.orderedProductMediaIds.length; i++) {
      const id = input.orderedProductMediaIds[i]!;
      await tx
        .update(productMedia)
        .set({ displayOrder: i })
        .where(and(eq(productMedia.id, id), eq(productMedia.productId, input.productId)));
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action,
      targetType: "product",
      targetId: input.productId,
      metadata: {
        mutation_request_digest: mutationRequestDigest,
        request_fingerprint: requestFingerprint,
        ordered_ids: input.orderedProductMediaIds,
      },
    });

    return { success: true, replayed: false };
  });
}

/**
 * Service: Designates a GLOBAL ProductMedia asset as the Product primary media.
 * Enforces global association, PUBLIC_MEDIA, IMAGE type, and canonical image MIME.
 */
export async function setProductPrimaryMedia(
  input: SetProductPrimaryMediaInput,
  options?: MediaServiceOptions
): Promise<{ success: boolean; primaryMediaId: string; replayed: boolean }> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!input.mutationRequestId || input.mutationRequestId.trim() === "") {
    throw new CatalogDomainError(
      "El identificador de solicitud de mutación es obligatorio.",
      "INVALID_MUTATION_REQUEST_ID",
      400
    );
  }

  // Load target ProductMedia and its MediaAsset
  const [pmRow] = await db
    .select({
      pm: productMedia,
      asset: mediaAssets,
    })
    .from(productMedia)
    .innerJoin(mediaAssets, eq(productMedia.mediaAssetId, mediaAssets.id))
    .where(
      and(eq(productMedia.id, input.productMediaId), eq(productMedia.productId, input.productId))
    );

  if (!pmRow) {
    throw new CatalogDomainError(
      "El medio multimedia especificado no pertenece a este producto.",
      "PRODUCT_MEDIA_NOT_FOUND",
      404
    );
  }

  // Invariant 1: Must be GLOBAL (variant_id IS NULL)
  if (pmRow.pm.variantId !== null) {
    throw new CatalogDomainError(
      "Solo un medio multimedia global (no asignado a una variante específica) puede ser designado como principal.",
      "PRIMARY_MEDIA_MUST_BE_GLOBAL",
      422
    );
  }

  // Invariant 2: Must be PUBLIC_MEDIA
  if (pmRow.asset.securityClass !== "PUBLIC_MEDIA") {
    throw new CatalogDomainError(
      "Solo medios públicos pueden ser designados como imagen principal.",
      "PRIMARY_MEDIA_MUST_BE_PUBLIC",
      422
    );
  }

  // Invariant 3: Must be IMAGE
  if (pmRow.asset.mediaType !== "IMAGE") {
    throw new CatalogDomainError(
      "Solo archivos de tipo imagen pueden ser designados como imagen principal.",
      "PRIMARY_MEDIA_MUST_BE_IMAGE",
      422
    );
  }

  // Invariant 4: Must use canonical allowed image MIME types from publish readiness
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(pmRow.asset.mimeType)) {
    throw new CatalogDomainError(
      `El tipo MIME (${pmRow.asset.mimeType}) no es válido para la imagen principal. Formatos permitidos: WebP, PNG, JPEG.`,
      "PRIMARY_MEDIA_INVALID_MIME",
      422
    );
  }

  const action = "catalog:media:primary";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );

  const requestFingerprint = computeRequestFingerprint({
    op: action,
    productId: input.productId,
    productMediaId: input.productMediaId,
    mediaAssetId: pmRow.pm.mediaAssetId,
  });

  return await db.transaction(async (tx) => {
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, action),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return { success: true, primaryMediaId: pmRow.pm.mediaAssetId, replayed: true };
    }

    // Optimistic Concurrency Check on Product
    const [currentProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId));

    if (!currentProduct) {
      throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    if (input.expectedUpdatedAt != null) {
      const expectedDate = new Date(input.expectedUpdatedAt).getTime();
      if (isNaN(expectedDate) || currentProduct.updatedAt.getTime() !== expectedDate) {
        throw new StaleWriteConflictError();
      }
    }

    await tx
      .update(products)
      .set({
        primaryMediaId: pmRow.pm.mediaAssetId,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.productId));

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action,
      targetType: "product",
      targetId: input.productId,
      metadata: {
        mutation_request_digest: mutationRequestDigest,
        request_fingerprint: requestFingerprint,
        media_asset_id: pmRow.pm.mediaAssetId,
      },
    });

    return { success: true, primaryMediaId: pmRow.pm.mediaAssetId, replayed: false };
  });
}

/**
 * Service: Reassigns a ProductMedia row to a Variant (or back to Global).
 * Preserves the primary-media global attachment invariant.
 */
export async function reassignProductMediaVariant(
  input: ReassignProductMediaVariantInput,
  options?: MediaServiceOptions
): Promise<{ productMedia: ProductMedia; replayed: boolean }> {
  const caller = await assertAuthorizedCaller("catalog:manage", options);

  if (!input.mutationRequestId || input.mutationRequestId.trim() === "") {
    throw new CatalogDomainError(
      "El identificador de solicitud de mutación es obligatorio.",
      "INVALID_MUTATION_REQUEST_ID",
      400
    );
  }

  // Load target ProductMedia
  const [pm] = await db
    .select()
    .from(productMedia)
    .where(
      and(eq(productMedia.id, input.productMediaId), eq(productMedia.productId, input.productId))
    );

  if (!pm) {
    throw new CatalogDomainError(
      "El medio multimedia no pertenece a este producto.",
      "PRODUCT_MEDIA_NOT_FOUND",
      404
    );
  }

  // If targetVariantId is non-null, verify it belongs to the same product
  if (input.targetVariantId !== null) {
    const [targetVar] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, input.targetVariantId));

    if (!targetVar) {
      throw new CatalogDomainError("La variante destino no existe.", "VARIANT_NOT_FOUND", 404);
    }

    if (targetVar.productId !== input.productId) {
      throw new CatalogDomainError(
        "La variante destino no pertenece a este producto.",
        "MEDIA_VARIANT_PRODUCT_MISMATCH",
        422
      );
    }
  }

  // Invariant: A ProductMedia backing the current primary media must NOT be moved
  // to a variant-specific association if it would leave the primary media with zero global attachments
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));

  if (product && product.primaryMediaId === pm.mediaAssetId && input.targetVariantId !== null) {
    const otherGlobals = await db
      .select()
      .from(productMedia)
      .where(
        and(
          eq(productMedia.productId, input.productId),
          eq(productMedia.mediaAssetId, pm.mediaAssetId),
          isNull(productMedia.variantId),
          ne(productMedia.id, pm.id)
        )
      );

    if (otherGlobals.length === 0) {
      throw new CatalogDomainError(
        "No se puede asignar a una variante el medio que respalda la imagen principal actual del producto.",
        "PRIMARY_MEDIA_CANNOT_BE_VARIANT_SPECIFIC",
        422
      );
    }
  }

  const action = "catalog:media:variant";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );

  const requestFingerprint = computeRequestFingerprint({
    op: action,
    productId: input.productId,
    productMediaId: input.productMediaId,
    targetVariantId: input.targetVariantId,
  });

  return await db.transaction(async (tx) => {
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, action),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      const [existingPm] = await tx
        .select()
        .from(productMedia)
        .where(eq(productMedia.id, input.productMediaId));

      if (!existingPm) {
        throw new CatalogReplayIntegrityError();
      }
      return { productMedia: existingPm, replayed: true };
    }

    const [updatedPm] = await tx
      .update(productMedia)
      .set({ variantId: input.targetVariantId })
      .where(
        and(eq(productMedia.id, input.productMediaId), eq(productMedia.productId, input.productId))
      )
      .returning();

    if (!updatedPm) {
      throw new CatalogDomainError(
        "El medio multimedia no existe.",
        "PRODUCT_MEDIA_NOT_FOUND",
        404
      );
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: caller.authUserId,
      action,
      targetType: "product_media",
      targetId: input.productMediaId,
      metadata: {
        mutation_request_digest: mutationRequestDigest,
        request_fingerprint: requestFingerprint,
        product_id: input.productId,
        target_variant_id: input.targetVariantId,
      },
    });

    return { productMedia: updatedPm, replayed: false };
  });
}
