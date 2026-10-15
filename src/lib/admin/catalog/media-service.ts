import "server-only";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  products,
  productVariants,
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
import { ALLOWED_IMAGE_MIME_TYPES } from "./publish-readiness";

export interface MediaServiceOptions {
  authContext?: VerifiedAuthContextReady;
  db?: typeof db;
}

export interface UpdateMediaAssetAltTextInput {
  productId: string;
  mediaAssetId: string;
  altText: string | null;
  mutationRequestId: string;
}

export interface DetachProductMediaInput {
  productId: string;
  productMediaId: string;
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
  expectedUpdatedAt: string | Date;
  mutationRequestId: string;
}

export interface ReassignProductMediaVariantInput {
  productId: string;
  productMediaId: string;
  targetVariantId: string | null;
  mutationRequestId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertReplayMarkerIdentity(
  auditRow: typeof auditEvents.$inferSelect,
  expected: { action: string; targetType: string; targetId: string }
): void {
  if (
    auditRow.action !== expected.action ||
    auditRow.targetType !== expected.targetType ||
    auditRow.targetId !== expected.targetId
  ) {
    throw new CatalogReplayIntegrityError();
  }
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
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      assertReplayMarkerIdentity(existingAudit, {
        action,
        targetType: "media_asset",
        targetId: input.mediaAssetId,
      });
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      const [existingAsset] = await tx
        .select({ asset: mediaAssets })
        .from(mediaAssets)
        .innerJoin(productMedia, eq(productMedia.mediaAssetId, mediaAssets.id))
        .where(
          and(eq(mediaAssets.id, input.mediaAssetId), eq(productMedia.productId, input.productId))
        );

      if (!existingAsset) {
        throw new CatalogReplayIntegrityError();
      }
      return { mediaAsset: existingAsset.asset, replayed: true };
    }

    // Authoritative transactional association recheck
    const [txPmRef] = await tx
      .select()
      .from(productMedia)
      .where(
        and(
          eq(productMedia.productId, input.productId),
          eq(productMedia.mediaAssetId, input.mediaAssetId)
        )
      );

    if (!txPmRef) {
      throw new CatalogDomainError(
        "El activo multimedia no está referenciado por este producto.",
        "MEDIA_ASSET_NOT_FOUND",
        404
      );
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
/**
 * Service: Removes an image from a product without destroying the stored object.
 *
 * Detaching rather than deleting keeps the content-addressed asset intact: the same bytes may be
 * attached to another product, and an immutable public object lets existing links and caches stay
 * valid. Remaining images are renumbered so display order has no gaps, and clearing the product's
 * primary image is refused outright — an operator has to choose a replacement first, otherwise a
 * published product silently loses the photo every storefront surface resolves through.
 */
export async function detachProductMedia(
  input: DetachProductMediaInput,
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

  const action = "catalog:media:detach";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );
  const requestFingerprint = computeRequestFingerprint({
    op: action,
    productId: input.productId,
    productMediaId: input.productMediaId,
  });

  const database = options?.db ?? db;

  return await database.transaction(async (tx) => {
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const [lockedProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      assertReplayMarkerIdentity(existingAudit, {
        action,
        targetType: "product",
        targetId: input.productId,
      });
      if (!lockedProduct) {
        throw new CatalogReplayIntegrityError();
      }
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return { success: true, replayed: true };
    }

    if (!lockedProduct) {
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    const [target] = await tx
      .select()
      .from(productMedia)
      .where(
        and(eq(productMedia.id, input.productMediaId), eq(productMedia.productId, input.productId))
      );

    if (!target) {
      throw new CatalogDomainError(
        "La imagen indicada no pertenece a este producto.",
        "PRODUCT_MEDIA_NOT_FOUND",
        404
      );
    }

    if (lockedProduct.primaryMediaId === target.mediaAssetId) {
      throw new CatalogDomainError(
        "No puedes quitar la imagen principal. Elige otra como principal y vuelve a intentarlo.",
        "PRIMARY_MEDIA_CANNOT_BE_DETACHED",
        422
      );
    }

    await tx.delete(productMedia).where(eq(productMedia.id, target.id));

    const remaining = await tx
      .select()
      .from(productMedia)
      .where(
        and(
          eq(productMedia.productId, input.productId),
          eq(productMedia.placement, target.placement)
        )
      )
      .orderBy(asc(productMedia.displayOrder), asc(productMedia.createdAt), asc(productMedia.id));

    for (let i = 0; i < remaining.length; i++) {
      const row = remaining[i];
      if (!row || row.displayOrder === i) continue;
      await tx.update(productMedia).set({ displayOrder: i }).where(eq(productMedia.id, row.id));
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
        product_media_id: target.id,
        media_asset_id: target.mediaAssetId,
      },
    });

    return { success: true, replayed: false };
  });
}

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
    // 1. Advisory Lock
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // 2. Lock Product Row FOR UPDATE
    const [lockedProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    // 3. Replay Check
    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      assertReplayMarkerIdentity(existingAudit, {
        action,
        targetType: "product",
        targetId: input.productId,
      });
      if (!lockedProduct) {
        throw new CatalogReplayIntegrityError();
      }
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return { success: true, replayed: true };
    }

    if (!lockedProduct) {
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    // 4. Authoritative Membership Verification inside Transaction
    const currentRows = await tx
      .select()
      .from(productMedia)
      .where(
        and(eq(productMedia.productId, input.productId), eq(productMedia.placement, "GALLERY"))
      );

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
 * Enforces global association, PUBLIC_MEDIA, IMAGE type, canonical image MIME,
 * and optimistic concurrency via required expectedUpdatedAt.
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

  if (input.expectedUpdatedAt === undefined || input.expectedUpdatedAt === null) {
    throw new CatalogDomainError(
      "La fecha expectedUpdatedAt es obligatoria para la concurrencia optimista.",
      "INVALID_EXPECTED_UPDATED_AT",
      400
    );
  }

  const expectedDateObj = new Date(input.expectedUpdatedAt);
  if (isNaN(expectedDateObj.getTime())) {
    throw new CatalogDomainError(
      "La fecha expectedUpdatedAt no es válida.",
      "INVALID_EXPECTED_UPDATED_AT",
      400
    );
  }
  const normalizedExpectedUpdatedAt = expectedDateObj.toISOString();

  const action = "catalog:media:primary";
  const mutationRequestDigest = computeMutationRequestDigest(
    caller.authUserId,
    action,
    input.mutationRequestId
  );

  return await db.transaction(async (tx) => {
    // 1. Advisory Lock
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // 2. Lock Product Row FOR UPDATE
    const [lockedProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    // 3. Replay Check Under Lock (Prior to Stale-Write Check so Legitimate Retries Replay)
    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      assertReplayMarkerIdentity(existingAudit, {
        action,
        targetType: "product",
        targetId: input.productId,
      });
      if (!lockedProduct) {
        throw new CatalogReplayIntegrityError();
      }

      const metadata = existingAudit.metadata as Record<string, unknown>;
      const recordedMediaAssetId = metadata.media_asset_id;
      if (typeof recordedMediaAssetId !== "string" || !UUID_PATTERN.test(recordedMediaAssetId)) {
        throw new CatalogReplayIntegrityError();
      }

      const [recordedProductMedia] = await tx
        .select({ pm: productMedia })
        .from(productMedia)
        .innerJoin(mediaAssets, eq(productMedia.mediaAssetId, mediaAssets.id))
        .where(
          and(
            eq(productMedia.id, input.productMediaId),
            eq(productMedia.productId, input.productId),
            eq(productMedia.mediaAssetId, recordedMediaAssetId)
          )
        );
      if (!recordedProductMedia) {
        throw new CatalogReplayIntegrityError();
      }

      const requestFingerprint = computeRequestFingerprint({
        op: action,
        productId: input.productId,
        productMediaId: input.productMediaId,
        mediaAssetId: recordedMediaAssetId,
        expectedUpdatedAt: normalizedExpectedUpdatedAt,
      });
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return {
        success: true,
        primaryMediaId: recordedMediaAssetId,
        replayed: true,
      };
    }

    if (!lockedProduct) {
      throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    // 4. Optimistic Concurrency Check on Locked Product
    if (lockedProduct.updatedAt.getTime() !== expectedDateObj.getTime()) {
      throw new StaleWriteConflictError();
    }

    // 5. Re-load and Re-verify Invariants Under Transaction
    const [pmRow] = await tx
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

    const requestFingerprint = computeRequestFingerprint({
      op: action,
      productId: input.productId,
      productMediaId: input.productMediaId,
      mediaAssetId: pmRow.pm.mediaAssetId,
      expectedUpdatedAt: normalizedExpectedUpdatedAt,
    });

    if (pmRow.pm.placement !== "GALLERY") {
      throw new CatalogDomainError(
        "Una imagen de la historia no puede ser la imagen principal del producto.",
        "PRIMARY_MEDIA_MUST_BE_GALLERY",
        422
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
 * Preserves the primary-media global attachment invariant under transactional product lock.
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
    // 1. Advisory Lock
    const lockKey = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // 2. Lock Product Row FOR UPDATE
    const [lockedProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    // 3. Replay Check Under Lock
    const [existingAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
        )
      );

    if (existingAudit) {
      assertReplayMarkerIdentity(existingAudit, {
        action,
        targetType: "product_media",
        targetId: input.productMediaId,
      });
      if (!lockedProduct) {
        throw new CatalogReplayIntegrityError();
      }
      const storedFp = (existingAudit.metadata as Record<string, unknown>)?.request_fingerprint;
      if (storedFp !== requestFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      const [existingPm] = await tx
        .select()
        .from(productMedia)
        .where(
          and(
            eq(productMedia.id, input.productMediaId),
            eq(productMedia.productId, input.productId)
          )
        );

      if (!existingPm) {
        throw new CatalogReplayIntegrityError();
      }
      return { productMedia: existingPm, replayed: true };
    }

    if (!lockedProduct) {
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    // 4. Re-load and verify target ProductMedia inside Transaction
    const [pm] = await tx
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

    if (pm.placement !== "GALLERY") {
      throw new CatalogDomainError(
        "Las imágenes de la historia no se asignan a una variante.",
        "MEDIA_STORY_VARIANT_NOT_ALLOWED",
        422
      );
    }

    // 5. Re-load and verify target Variant inside Transaction when non-null
    if (input.targetVariantId !== null) {
      const [targetVar] = await tx
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

    // 6. Primary Media Global Invariant Check under Product Row Lock
    if (lockedProduct.primaryMediaId === pm.mediaAssetId && input.targetVariantId !== null) {
      const otherGlobals = await tx
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
