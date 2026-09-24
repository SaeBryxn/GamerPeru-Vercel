import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
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
import {
  type CatalogStorageAdapter,
  R2CatalogStorageAdapter,
  derivePresignedPutLifetime,
  isAuthoritativeStorageNotFoundError,
} from "./media-storage";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { getCatalogMediaIntentSecret } from "@/config/server-env";
import { validateAndNormalizeCatalogImage } from "./image-normalizer";
import { ALLOWED_IMAGE_MIME_TYPES } from "./publish-readiness";

export interface MediaServiceOptions {
  authContext?: VerifiedAuthContextReady;
  storageAdapter?: CatalogStorageAdapter;
  intentSecret?: string;
  currentServerTimeSeconds?: number;
  db?: typeof db;
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
 * Focused internal helper for committed mediaIntentDigest replay validation.
 * Verifies audit action, targetType, target existence, and bound product/variant identity.
 */
async function resolveCommittedMediaIntentReplay(
  auditRow: typeof auditEvents.$inferSelect,
  tokenPayload: CatalogMediaUploadIntentPayload,
  txOrDb: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<{ productMedia: ProductMedia; mediaAsset: MediaAsset; replayed: true }> {
  if (auditRow.action !== "catalog:media:attach") {
    throw new CatalogDomainError(
      "Registro de auditoría de intención inconsistente.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  if (auditRow.targetType !== "product_media") {
    throw new CatalogDomainError(
      "El tipo de entidad del registro de auditoría es inconsistente.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  const [pm] = await txOrDb
    .select()
    .from(productMedia)
    .where(eq(productMedia.id, auditRow.targetId));

  if (!pm) {
    throw new CatalogDomainError(
      "El registro de ProductMedia referenciado en la auditoría no existe.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  if (pm.id !== auditRow.targetId) {
    throw new CatalogDomainError(
      "El identificador de ProductMedia no coincide con el registro de auditoría.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  if (pm.productId !== tokenPayload.productId) {
    throw new CatalogDomainError(
      "El ProductMedia referenciado pertenece a un producto distinto al token firmado.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  const expectedVariantId = tokenPayload.variantId ?? null;
  const actualVariantId = pm.variantId ?? null;
  if (actualVariantId !== expectedVariantId) {
    throw new CatalogDomainError(
      "La variante del ProductMedia referenciado no coincide con el token firmado.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  const [asset] = await txOrDb
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, pm.mediaAssetId));

  if (!asset) {
    throw new CatalogDomainError(
      "El MediaAsset referenciado por el ProductMedia no existe.",
      "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
      500
    );
  }

  return { productMedia: pm, mediaAsset: asset, replayed: true };
}

/**
 * Focused internal helper for mutationRequestDigest replay validation.
 * Verifies fingerprint, targetType, target existence, and bound product/variant identity.
 */
async function resolveCommittedMutationReplay(
  auditRow: typeof auditEvents.$inferSelect,
  expectedFingerprint: string,
  expectedProductId: string,
  expectedVariantId: string | null,
  txOrDb: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<{ productMedia: ProductMedia; mediaAsset: MediaAsset; replayed: true }> {
  const storedFp = (auditRow.metadata as Record<string, unknown>)?.request_fingerprint;
  if (storedFp !== expectedFingerprint) {
    throw new CatalogIdempotencyConflictError();
  }

  if (auditRow.targetType !== "product_media") {
    throw new CatalogReplayIntegrityError();
  }

  const [existingPm] = await txOrDb
    .select()
    .from(productMedia)
    .where(eq(productMedia.id, auditRow.targetId));

  if (!existingPm) {
    throw new CatalogReplayIntegrityError();
  }

  if (existingPm.productId !== expectedProductId) {
    throw new CatalogReplayIntegrityError();
  }

  const expectedVar = expectedVariantId ?? null;
  const actualVar = existingPm.variantId ?? null;
  if (actualVar !== expectedVar) {
    throw new CatalogReplayIntegrityError();
  }

  const [existingAsset] = await txOrDb
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, existingPm.mediaAssetId));

  if (!existingAsset) {
    throw new CatalogReplayIntegrityError();
  }

  return { productMedia: existingPm, mediaAsset: existingAsset, replayed: true };
}

async function resolveDurableFinalizationReplay(
  actorId: string,
  mutationRequestDigest: string,
  requestFingerprint: string,
  mediaIntentDigest: string,
  payload: CatalogMediaUploadIntentPayload,
  database: typeof db
): Promise<FinalizeCatalogMediaUploadResult | null> {
  const [mutationAudit] = await database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorId, actorId),
        eq(auditEvents.action, "catalog:media:attach"),
        sql`${auditEvents.metadata}->>'mutation_request_digest' = ${mutationRequestDigest}`
      )
    );

  if (mutationAudit) {
    return resolveCommittedMutationReplay(
      mutationAudit,
      requestFingerprint,
      payload.productId,
      payload.variantId,
      database
    );
  }

  const [intentAudit] = await database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorId, actorId),
        eq(auditEvents.action, "catalog:media:attach"),
        sql`${auditEvents.metadata}->>'media_intent_digest' = ${mediaIntentDigest}`
      )
    );

  if (intentAudit) {
    return resolveCommittedMediaIntentReplay(intentAudit, payload, database);
  }

  return null;
}

/**
 * Service: Issues a stateless, server-signed media upload intent capability and presigned PUT URL.
 * Binds actor, product, optional variant, staging key, expected MIME, and max bytes.
 * Guarantees presigned PUT expiry <= signed intent expiresAt at all times.
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

  // Derive presigned expiry from remaining intent lifetime: presigned PUT expiry <= signed intent expiresAt
  const currentTime = options?.currentServerTimeSeconds ?? Math.floor(Date.now() / 1000);
  const presignedExpiresInSeconds = derivePresignedPutLifetime(
    expiresAt,
    currentTime,
    expiresInSeconds
  );

  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  const presignedPutUrl = await adapter.generatePresignedPutUrl({
    bucket: R2_BUCKETS.CATALOG_STAGING,
    key: stagingObjectKey,
    contentType: input.mimeType,
    expiresInSeconds: presignedExpiresInSeconds,
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

  const database = options?.db ?? db;

  if (payload.verifiedActorId !== caller.authUserId) {
    throw new CatalogDomainError(
      "El token de subida no pertenece al usuario autenticado actual.",
      "FORBIDDEN",
      403
    );
  }

  // Authoritative Product and Brand Lookup
  const [prodRow] = await database
    .select({ product: products, brand: brands })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.id, payload.productId));

  if (!prodRow) {
    throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
  }

  // Authoritative Variant Ownership Verification
  if (payload.variantId != null) {
    const [variant] = await database
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
  const [existingMutationAudit] = await database
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
    return await resolveCommittedMutationReplay(
      existingMutationAudit,
      requestFingerprint,
      payload.productId,
      payload.variantId,
      database
    );
  }

  // EARLY PROBE 2: Media Intent Consumption Replay Probe
  const [existingIntentAudit] = await database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorId, caller.authUserId),
        eq(auditEvents.action, "catalog:media:attach"),
        sql`${auditEvents.metadata}->>'media_intent_digest' = ${mediaIntentDigest}`
      )
    );

  if (existingIntentAudit) {
    // Valid consumption marker resolves replay without accessing staging storage
    return await resolveCommittedMediaIntentReplay(existingIntentAudit, payload, database);
  }

  // STAGING OBJECT VERIFICATION & NORMALIZATION
  const adapter = options?.storageAdapter ?? new R2CatalogStorageAdapter();
  let stagingHead;
  try {
    stagingHead = await adapter.headObject({
      bucket: R2_BUCKETS.CATALOG_STAGING,
      key: payload.stagingObjectKey,
    });
  } catch (error: unknown) {
    const replay = await resolveDurableFinalizationReplay(
      caller.authUserId,
      mutationRequestDigest,
      requestFingerprint,
      mediaIntentDigest,
      payload,
      database
    );
    if (replay) return replay;
    throw error;
  }

  if (!stagingHead) {
    const replay = await resolveDurableFinalizationReplay(
      caller.authUserId,
      mutationRequestDigest,
      requestFingerprint,
      mediaIntentDigest,
      payload,
      database
    );
    if (replay) return replay;

    throw new CatalogDomainError(
      "El objeto en staging no existe o está vacío.",
      "MEDIA_STAGING_NOT_FOUND",
      400
    );
  }

  if (stagingHead.contentLength === 0) {
    throw new CatalogDomainError(
      "El objeto en staging no existe o está vacío.",
      "MEDIA_STAGING_NOT_FOUND",
      400
    );
  }

  if (stagingHead.contentLength > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new CatalogDomainError(
      "El archivo excede el tamaño máximo permitido de 10 MiB.",
      "MEDIA_FILE_TOO_LARGE",
      400
    );
  }

  let stagingBytes: Buffer;
  try {
    stagingBytes = await adapter.getObjectBytesBounded({
      bucket: R2_BUCKETS.CATALOG_STAGING,
      key: payload.stagingObjectKey,
      maxBytes: MAX_MEDIA_FILE_SIZE_BYTES,
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "PAYLOAD_TOO_LARGE" || e?.message?.includes("exceeded maximum allowed bytes")) {
      throw new CatalogDomainError(
        "El archivo excede el tamaño máximo permitido de 10 MiB.",
        "MEDIA_FILE_TOO_LARGE",
        400
      );
    }

    const replay = await resolveDurableFinalizationReplay(
      caller.authUserId,
      mutationRequestDigest,
      requestFingerprint,
      mediaIntentDigest,
      payload,
      database
    );
    if (replay) return replay;

    if (isAuthoritativeStorageNotFoundError(err)) {
      throw new CatalogDomainError(
        "El objeto en staging no existe o está vacío.",
        "MEDIA_STAGING_NOT_FOUND",
        400
      );
    }
    throw err;
  }

  if (stagingBytes.length === 0) {
    throw new CatalogDomainError("El archivo de imagen está vacío.", "MEDIA_FILE_EMPTY", 400);
  }

  if (stagingBytes.length > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new CatalogDomainError(
      "El archivo excede el tamaño máximo permitido de 10 MiB.",
      "MEDIA_FILE_TOO_LARGE",
      400
    );
  }

  const normalized = await validateAndNormalizeCatalogImage(
    stagingBytes,
    payload.expectedIncomingMimeType
  );

  // Canonical Content-Hashed Key: products/{brandSlug}/{productSlug}/{sha256}.webp
  const canonicalKey = `products/${prodRow.brand.slug}/${prodRow.product.slug}/${normalized.checksumSha256}.webp`;

  // Safe Conditional Public Write (If-None-Match: "*")
  const writeResult = await adapter.putObjectIfNotExists({
    bucket: R2_BUCKETS.PUBLIC_MEDIA,
    key: canonicalKey,
    body: normalized.normalizedWebpBuffer,
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });

  if (!writeResult.created) {
    // Existing object or concurrent writer won race. Verify existing object's content integrity.
    const existingHead = await adapter.headObject({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: canonicalKey,
    });

    if (!existingHead) {
      throw new CatalogDomainError(
        "No se pudo verificar el objeto público existente.",
        "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        500
      );
    }

    if (existingHead.contentType !== "image/webp") {
      throw new CatalogDomainError(
        "El tipo MIME del objeto público existente no coincide con image/webp.",
        "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        500
      );
    }

    if (existingHead.contentLength !== normalized.fileSizeBytes) {
      throw new CatalogDomainError(
        "La longitud del objeto público existente no coincide con el tamaño normalizado.",
        "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        500
      );
    }

    const existingBytes = await adapter.getObjectBytes({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: canonicalKey,
    });
    const existingHash = createHash("sha256").update(existingBytes).digest("hex");

    if (existingHash !== normalized.checksumSha256) {
      throw new CatalogDomainError(
        "Discrepancia de integridad en el hash SHA-256 del objeto público existente.",
        "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        500
      );
    }
  }

  // DATABASE TRANSACTION WITH DUAL ADVISORY LOCKS AND PRODUCT ROW LOCK
  const result = await database.transaction(async (tx) => {
    // 1. Advisory Lock 1: mutationRequestDigest
    const lockKey1 = createCatalogAdvisoryLockKey(mutationRequestDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1})`);

    // 2. Advisory Lock 2: mediaIntentDigest
    const lockKey2 = createCatalogMediaIntentAdvisoryLockKey(mediaIntentDigest);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey2})`);

    // 3. Product Row Lock: serializes concurrent attachments for the same Product
    const [lockedProduct] = await tx
      .select()
      .from(products)
      .where(eq(products.id, payload.productId))
      .for("update");

    if (!lockedProduct) {
      throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    // Recheck Mutation Replay Under Lock
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
      return await resolveCommittedMutationReplay(
        lockedMutationAudit,
        requestFingerprint,
        payload.productId,
        payload.variantId,
        tx
      );
    }

    // Recheck Intent Consumption Replay Under Lock
    const [lockedIntentAudit] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorId, caller.authUserId),
          eq(auditEvents.action, "catalog:media:attach"),
          sql`${auditEvents.metadata}->>'media_intent_digest' = ${mediaIntentDigest}`
        )
      );

    if (lockedIntentAudit) {
      return await resolveCommittedMediaIntentReplay(lockedIntentAudit, payload, tx);
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

    // Race-Safe MediaAsset Persistence (Handling physical UNIQUE on object_key via ON CONFLICT DO NOTHING)
    const [insertedAsset] = await tx
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
      .onConflictDoNothing({ target: mediaAssets.objectKey })
      .returning();

    let asset: MediaAsset;
    if (insertedAsset) {
      asset = insertedAsset;
    } else {
      const [winner] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.objectKey, canonicalKey));

      if (!winner) {
        throw new CatalogDomainError(
          "No se pudo resolver el MediaAsset existente.",
          "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
          500
        );
      }

      if (
        winner.objectKey !== canonicalKey ||
        winner.securityClass !== "PUBLIC_MEDIA" ||
        winner.mediaType !== "IMAGE" ||
        winner.mimeType !== "image/webp" ||
        winner.fileSizeBytes !== normalized.fileSizeBytes ||
        winner.width !== normalized.width ||
        winner.height !== normalized.height ||
        winner.checksumSha256 !== normalized.checksumSha256
      ) {
        throw new CatalogDomainError(
          "Discrepancia en metadatos canónicos de MediaAsset existente.",
          "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
          500
        );
      }
      asset = winner;
    }

    // Compute next display_order for product under product row lock
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
      .where(eq(productMedia.productId, input.productId))
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
