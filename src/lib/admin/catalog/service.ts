import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  requirePermission,
  requireAdminAccess,
  type VerifiedAuthContextReady,
} from "@/lib/auth/rbac";
import type { Product, ProductVariant } from "@/db/schema";
import type {
  CreateProductInput,
  CreateVariantInput,
  DuplicateProductInput,
  StatusTransitionInput,
  UpdateProductInput,
  UpdateVariantInput,
  VariantStatus,
} from "./types";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  SkuImmutableError,
  StaleWriteConflictError,
} from "./types";
import {
  computeMutationRequestDigest,
  computeRequestFingerprint,
  createCatalogAdvisoryLockKey,
} from "./crypto";
import {
  validateProductSpecificationValues,
  resolveAuthoritativeCategorySpecificationSchema,
} from "./specifications";
import { PRODUCT_SLUG_REGEX } from "./publish-readiness";
import { loadInternalProductDetail } from "./readers";
import { isPlainRecord } from "./record";

export interface ServiceOptions {
  authContext?: VerifiedAuthContextReady;
}

function mapProductRow(raw: Record<string, unknown>): Product {
  return {
    id: String(raw.id),
    brandId: String(raw.brand_id),
    categoryId: String(raw.category_id),
    name: String(raw.name),
    slug: String(raw.slug),
    subtitle: raw.subtitle ? String(raw.subtitle) : null,
    description: raw.description ? String(raw.description) : null,
    status: raw.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    isFeatured: Boolean(raw.is_featured),
    primaryMediaId: raw.primary_media_id ? String(raw.primary_media_id) : null,
    createdAt: new Date(String(raw.created_at)),
    updatedAt: new Date(String(raw.updated_at)),
  };
}

function mapVariantRow(raw: Record<string, unknown>): ProductVariant {
  return {
    id: String(raw.id),
    productId: String(raw.product_id),
    sku: String(raw.sku),
    title: String(raw.title),
    priceCents: Number(raw.price_cents),
    compareAtPriceCents:
      raw.compare_at_price_cents !== null && raw.compare_at_price_cents !== undefined
        ? Number(raw.compare_at_price_cents)
        : null,
    costCents:
      raw.cost_cents !== null && raw.cost_cents !== undefined ? Number(raw.cost_cents) : null,
    weightGrams:
      raw.weight_grams !== null && raw.weight_grams !== undefined ? Number(raw.weight_grams) : null,
    attributes: (raw.attributes ?? {}) as Record<string, string>,
    status: raw.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
    displayOrder: Number(raw.display_order ?? 0),
    createdAt: new Date(String(raw.created_at)),
    updatedAt: new Date(String(raw.updated_at)),
  };
}

/**
 * Resolves verified actor ID and asserts permission.
 */
async function resolveActorAndAssertPermission(
  permission: "catalog:manage" | "catalog:publish",
  options?: ServiceOptions
): Promise<{ authUserId: string; email: string | null }> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has(permission)) {
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

  const context = await requirePermission(permission);
  return {
    authUserId: context.authUserId,
    email: context.email,
  };
}

async function resolveAuthContext(options?: ServiceOptions): Promise<VerifiedAuthContextReady> {
  if (options?.authContext) {
    return options.authContext;
  }
  return await requireAdminAccess();
}

export interface RawVariantInput {
  sku?: unknown;
  title?: unknown;
  priceCents?: unknown;
  compareAtPriceCents?: unknown;
  costCents?: unknown;
  weightGrams?: unknown;
  displayOrder?: unknown;
  status?: unknown;
  attributes?: unknown;
}

export interface ValidatedVariantInput {
  sku: string;
  title: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  weightGrams: number | null;
  displayOrder: number;
  status: VariantStatus;
  attributes: Record<string, string>;
}

export function validateProductVariantInput(
  raw: RawVariantInput,
  _context: "create" | "update" = "create"
): ValidatedVariantInput {
  if (typeof raw.sku !== "string") {
    throw new CatalogDomainError("El SKU debe ser una cadena de texto.", "INVALID_SKU", 400);
  }
  const sku = raw.sku.trim();
  if (!sku || sku.length > 50) {
    throw new CatalogDomainError(
      "El SKU no puede estar vacío ni exceder 50 caracteres.",
      "INVALID_SKU",
      400
    );
  }

  if (typeof raw.title !== "string") {
    throw new CatalogDomainError(
      "El título de la variante debe ser una cadena de texto.",
      "INVALID_VARIANT_TITLE",
      400
    );
  }
  const title = raw.title.trim();
  if (!title || title.length > 150) {
    throw new CatalogDomainError(
      "El título de la variante no puede estar vacío ni exceder 150 caracteres.",
      "INVALID_VARIANT_TITLE",
      400
    );
  }

  if (
    typeof raw.priceCents !== "number" ||
    !Number.isInteger(raw.priceCents) ||
    raw.priceCents < 1 ||
    raw.priceCents > 2147483647
  ) {
    throw new CatalogDomainError(
      "El precio de venta debe ser un entero positivo entre 1 y 2147483647 centavos.",
      "INVALID_PRICE",
      400
    );
  }
  const priceCents = raw.priceCents;

  let compareAtPriceCents: number | null = null;
  if (raw.compareAtPriceCents !== null && raw.compareAtPriceCents !== undefined) {
    if (
      typeof raw.compareAtPriceCents !== "number" ||
      !Number.isInteger(raw.compareAtPriceCents) ||
      raw.compareAtPriceCents < 0 ||
      raw.compareAtPriceCents > 2147483647
    ) {
      throw new CatalogDomainError(
        "El precio de comparación debe ser un entero entre 0 y 2147483647 centavos.",
        "INVALID_COMPARE_AT_PRICE",
        400
      );
    }
    compareAtPriceCents = raw.compareAtPriceCents;
  }

  let costCents: number | null = null;
  if (raw.costCents !== null && raw.costCents !== undefined) {
    if (
      typeof raw.costCents !== "number" ||
      !Number.isInteger(raw.costCents) ||
      raw.costCents < 0 ||
      raw.costCents > 2147483647
    ) {
      throw new CatalogDomainError(
        "El costo debe ser un entero entre 0 y 2147483647 centavos.",
        "INVALID_COST",
        400
      );
    }
    costCents = raw.costCents;
  }

  let weightGrams: number | null = null;
  if (raw.weightGrams !== null && raw.weightGrams !== undefined) {
    if (
      typeof raw.weightGrams !== "number" ||
      !Number.isInteger(raw.weightGrams) ||
      raw.weightGrams <= 0 ||
      raw.weightGrams > 2147483647
    ) {
      throw new CatalogDomainError(
        "El peso debe ser un entero positivo mayor a 0 gramos dentro del rango permitido.",
        "INVALID_WEIGHT",
        400
      );
    }
    weightGrams = raw.weightGrams;
  }

  let displayOrder = 0;
  if (raw.displayOrder !== null && raw.displayOrder !== undefined) {
    if (
      typeof raw.displayOrder !== "number" ||
      !Number.isInteger(raw.displayOrder) ||
      raw.displayOrder < 0 ||
      raw.displayOrder > 2147483647
    ) {
      throw new CatalogDomainError(
        "El orden de visualización debe ser un entero no negativo dentro del rango permitido.",
        "INVALID_DISPLAY_ORDER",
        400
      );
    }
    displayOrder = raw.displayOrder;
  }

  let status: VariantStatus = "ACTIVE";
  if (raw.status !== null && raw.status !== undefined) {
    if (raw.status !== "ACTIVE" && raw.status !== "INACTIVE" && raw.status !== "ARCHIVED") {
      throw new CatalogDomainError(
        "El estado de la variante es inválido.",
        "INVALID_VARIANT_STATUS",
        400
      );
    }
    status = raw.status;
  }

  let attributes: Record<string, string> = {};
  if (raw.attributes !== null && raw.attributes !== undefined) {
    if (!isPlainRecord(raw.attributes)) {
      throw new CatalogDomainError(
        "Los atributos de la variante deben ser un objeto plano clave-valor.",
        "INVALID_VARIANT_ATTRIBUTES",
        400
      );
    }
    const cleanedAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.attributes)) {
      if (typeof k !== "string" || typeof v !== "string") {
        throw new CatalogDomainError(
          "Todos los nombres y valores de atributos deben ser cadenas de texto.",
          "INVALID_VARIANT_ATTRIBUTES",
          400
        );
      }
      cleanedAttrs[k] = v;
    }
    attributes = cleanedAttrs;
  }

  return {
    sku,
    title,
    priceCents,
    compareAtPriceCents,
    costCents,
    weightGrams,
    displayOrder,
    status,
    attributes,
  };
}

function handleDatabaseError(err: unknown): never {
  if (err instanceof CatalogDomainError) {
    throw err;
  }
  const anyErr = (err && typeof err === "object" ? err : {}) as Record<string, unknown>;
  const cause = (
    anyErr.cause && typeof anyErr.cause === "object" ? anyErr.cause : anyErr.origin
  ) as Record<string, unknown> | undefined;

  const code = String(anyErr.code ?? cause?.code ?? "");
  const constraintName = String(
    anyErr.constraint_name ?? anyErr.constraint ?? cause?.constraint_name ?? cause?.constraint ?? ""
  );
  const detail = String(anyErr.detail ?? cause?.detail ?? "");
  const message = `${String(anyErr.message ?? "")} ${String(cause?.message ?? "")}`;
  const tableName = String(
    anyErr.table_name ?? anyErr.table ?? cause?.table_name ?? cause?.table ?? ""
  );

  const fullText = `${constraintName} ${detail} ${message} ${tableName}`.toLowerCase();

  if (
    code === "23505" ||
    fullText.includes("23505") ||
    fullText.includes("duplicate key value violates unique constraint")
  ) {
    if (
      fullText.includes("products_slug_unique") ||
      fullText.includes("slug") ||
      tableName === "products"
    ) {
      throw new CatalogDomainError(
        "El slug ya está en uso por otro producto.",
        "SLUG_CONFLICT",
        409
      );
    }
    if (
      fullText.includes("product_variants_sku_unique") ||
      fullText.includes("sku") ||
      tableName === "product_variants"
    ) {
      throw new CatalogDomainError("El SKU ya está registrado en el sistema.", "SKU_CONFLICT", 409);
    }
    throw new CatalogDomainError(
      "Conflicto de unicidad en la base de datos.",
      "UNIQUE_CONFLICT",
      409
    );
  }
  throw err;
}

/**
 * Creates a new Product in DRAFT status with optional initial Variant.
 * Guaranteed transactional with durable AuditEvent and advisory-locked idempotency replay.
 */
export async function createProduct(
  input: CreateProductInput,
  options?: ServiceOptions
): Promise<Product> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  // Validate Name
  const trimmedName = input.name?.trim() ?? "";
  if (!trimmedName || trimmedName.length > 200) {
    throw new CatalogDomainError(
      "El nombre del producto es obligatorio y debe tener como máximo 200 caracteres.",
      "INVALID_PRODUCT_NAME"
    );
  }

  // Validate Slug
  const trimmedSlug = input.slug?.trim().toLowerCase() ?? "";
  if (!trimmedSlug || !PRODUCT_SLUG_REGEX.test(trimmedSlug) || trimmedSlug.length > 200) {
    throw new CatalogDomainError(
      "El slug del producto es inválido (solo letras minúsculas, números y guiones).",
      "INVALID_PRODUCT_SLUG"
    );
  }

  // Normalize Subtitle & Description exactly as persistence stores them
  const normalizedSubtitle =
    typeof input.subtitle === "string" && input.subtitle.trim().length > 0
      ? input.subtitle.trim()
      : null;
  const normalizedDescription =
    typeof input.description === "string" && input.description.trim().length > 0
      ? input.description.trim()
      : null;

  // Validate and normalize Initial Variant using central authoritative validator
  const validatedInitialVariant = input.initialVariant
    ? validateProductVariantInput(input.initialVariant, "create")
    : null;

  // Single canonical normalized mutation payload used for both fingerprint and persistence
  const normalizedProductPayload = {
    brandId: input.brandId,
    categoryId: input.categoryId,
    description: normalizedDescription,
    initialVariant: validatedInitialVariant,
    isFeatured: Boolean(input.isFeatured),
    name: trimmedName,
    slug: trimmedSlug,
    subtitle: normalizedSubtitle,
  };

  // Idempotency Digests
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      "catalog:product:create",
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint(normalizedProductPayload);
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

  try {
    return await db.transaction(async (tx): Promise<Product> => {
      // Acquire Transaction Advisory Lock if idempotent
      if (lockKey !== null && mutationRequestDigest) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

        // Replay lookup under lock
        const existingAuditRows = (await tx.execute(sql`
          SELECT * FROM audit_events
          WHERE actor_id = ${authUserId}
            AND action = 'catalog:product:create'
            AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
          ORDER BY timestamp DESC
          LIMIT 1;
        `)) as unknown as {
          target_type: string;
          target_id: string;
          metadata: { request_fingerprint?: string };
        }[];

        if (existingAuditRows[0]) {
          const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
          if (storedFingerprint !== requestFingerprint) {
            throw new CatalogIdempotencyConflictError();
          }

          if (existingAuditRows[0].target_type !== "product") {
            throw new CatalogReplayIntegrityError();
          }

          const targetProductId = existingAuditRows[0].target_id;
          const [targetProdRow] = (await tx.execute(sql`
            SELECT * FROM products WHERE id = ${targetProductId}::uuid LIMIT 1;
          `)) as unknown as Record<string, unknown>[];

          if (!targetProdRow) {
            throw new CatalogReplayIntegrityError();
          }

          return mapProductRow(targetProdRow);
        }
      }

      // Verify Brand exists and is PUBLISHED
      const brandRows = (await tx.execute(sql`
        SELECT status FROM brands WHERE id = ${normalizedProductPayload.brandId}::uuid LIMIT 1;
      `)) as unknown as { status: string }[];

      if (!brandRows[0] || brandRows[0].status !== "PUBLISHED") {
        throw new CatalogDomainError(
          "La marca seleccionada no existe o no está publicada.",
          "INVALID_BRAND"
        );
      }

      // Verify Category exists and is PUBLISHED
      const categoryRows = (await tx.execute(sql`
        SELECT status FROM categories WHERE id = ${normalizedProductPayload.categoryId}::uuid LIMIT 1;
      `)) as unknown as { status: string }[];

      if (!categoryRows[0] || categoryRows[0].status !== "PUBLISHED") {
        throw new CatalogDomainError(
          "La categoría seleccionada no existe o no está publicada.",
          "INVALID_CATEGORY"
        );
      }

      // Check slug uniqueness
      const slugConflictRows = (await tx.execute(sql`
        SELECT id FROM products WHERE slug = ${normalizedProductPayload.slug} LIMIT 1;
      `)) as unknown as { id: string }[];

      if (slugConflictRows[0]) {
        throw new CatalogDomainError(
          `El slug "${normalizedProductPayload.slug}" ya está en uso por otro producto.`,
          "SLUG_CONFLICT",
          409
        );
      }

      const productId = generateUuidV7();

      // Insert Product (Canonically DRAFT)
      const [rawCreated] = (await tx.execute(sql`
        INSERT INTO products (
          id, brand_id, category_id, name, slug, subtitle, description, status, is_featured, created_at, updated_at
        ) VALUES (
          ${productId}::uuid,
          ${normalizedProductPayload.brandId}::uuid,
          ${normalizedProductPayload.categoryId}::uuid,
          ${normalizedProductPayload.name},
          ${normalizedProductPayload.slug},
          ${normalizedProductPayload.subtitle},
          ${normalizedProductPayload.description},
          'DRAFT',
          ${normalizedProductPayload.isFeatured},
          NOW(),
          NOW()
        )
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawCreated) {
        throw new CatalogDomainError("No se pudo crear el producto.", "CREATE_PRODUCT_FAILED", 500);
      }

      const createdProduct = mapProductRow(rawCreated);

      // Insert Initial Variant if provided
      if (normalizedProductPayload.initialVariant) {
        const validatedVariant = normalizedProductPayload.initialVariant;

        // Check SKU uniqueness
        const skuConflictRows = (await tx.execute(sql`
          SELECT id FROM product_variants WHERE sku = ${validatedVariant.sku} LIMIT 1;
        `)) as unknown as { id: string }[];

        if (skuConflictRows[0]) {
          throw new CatalogDomainError(
            `El SKU "${validatedVariant.sku}" ya está registrado en el sistema.`,
            "SKU_CONFLICT",
            409
          );
        }

        await tx.execute(sql`
          INSERT INTO product_variants (
            id, product_id, sku, title, price_cents, compare_at_price_cents, cost_cents,
            weight_grams, attributes, status, display_order, created_at, updated_at
          ) VALUES (
            ${generateUuidV7()}::uuid,
            ${productId}::uuid,
            ${validatedVariant.sku},
            ${validatedVariant.title},
            ${validatedVariant.priceCents},
            ${validatedVariant.compareAtPriceCents},
            ${validatedVariant.costCents},
            ${validatedVariant.weightGrams},
            ${JSON.stringify(validatedVariant.attributes)}::jsonb,
            ${validatedVariant.status},
            ${validatedVariant.displayOrder},
            NOW(),
            NOW()
          );
        `);
      }

      // Insert Transactional AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      const auditMetadata: Record<string, unknown> = {
        name: trimmedName,
        slug: trimmedSlug,
        brand_id: input.brandId,
        category_id: input.categoryId,
      };
      if (mutationRequestDigest) {
        auditMetadata.mutation_request_digest = mutationRequestDigest;
      }
      if (requestFingerprint) {
        auditMetadata.request_fingerprint = requestFingerprint;
      }

      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          'catalog:product:create',
          'product',
          ${productId},
          ${JSON.stringify(auditMetadata)}::jsonb,
          NULL
        );
      `);

      return createdProduct;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}

/**
 * Updates an existing Product.
 * Handles optimistic concurrency, Brand/Category validation, and Category-change specification reconciliation.
 */
interface NormalizedUpdateProductInput {
  productId: string;
  expectedUpdatedAt: string;
  name?: string;
  slug?: string;
  brandId?: string;
  categoryId?: string;
  subtitle?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  specValues?: Record<string, unknown>;
}

function normalizeUpdateProductInput(input: UpdateProductInput): NormalizedUpdateProductInput {
  const expectedTime = new Date(input.expectedUpdatedAt).getTime();
  if (Number.isNaN(expectedTime)) {
    throw new CatalogDomainError(
      "El timestamp expectedUpdatedAt es inválido.",
      "INVALID_TIMESTAMP",
      400
    );
  }

  const normalized: NormalizedUpdateProductInput = {
    productId: input.productId.trim().toLowerCase(),
    expectedUpdatedAt: new Date(expectedTime).toISOString(),
  };

  if (input.name !== undefined) normalized.name = input.name.trim();
  if (input.slug !== undefined) normalized.slug = input.slug.trim().toLowerCase();
  if (input.brandId !== undefined) normalized.brandId = input.brandId.trim().toLowerCase();
  if (input.categoryId !== undefined) {
    normalized.categoryId = input.categoryId.trim().toLowerCase();
  }
  if (input.subtitle !== undefined) {
    normalized.subtitle = input.subtitle === null ? null : input.subtitle.trim();
  }
  if (input.description !== undefined) {
    normalized.description = input.description === null ? null : input.description.trim();
  }
  if (input.isFeatured !== undefined) normalized.isFeatured = Boolean(input.isFeatured);

  if (input.specValues !== undefined && input.specValues !== null) {
    if (!isPlainRecord(input.specValues)) {
      throw new CatalogDomainError(
        "Las especificaciones técnicas deben ser un objeto JSON.",
        "INVALID_SPEC_VALUES_TYPE"
      );
    }
    normalized.specValues = Object.fromEntries(
      Object.entries(input.specValues).filter(([, value]) => value !== null && value !== undefined)
    );
  }

  return normalized;
}

export async function updateProduct(
  input: UpdateProductInput,
  options?: ServiceOptions
): Promise<Product> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);
  const normalizedMutationRequestId = input.mutationRequestId?.trim() ?? "";
  const normalizedInput = normalizedMutationRequestId ? normalizeUpdateProductInput(input) : input;
  const mutationRequestDigest = normalizedMutationRequestId
    ? computeMutationRequestDigest(
        authUserId,
        "catalog:product:update",
        normalizedMutationRequestId
      )
    : null;
  const requestFingerprint = mutationRequestDigest
    ? computeRequestFingerprint(normalizedInput)
    : null;
  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

  try {
    return await db.transaction(async (tx): Promise<Product> => {
      if (lockKey !== null && mutationRequestDigest && requestFingerprint) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

        const existingAuditRows = (await tx.execute(sql`
          SELECT actor_type, actor_id, action, target_type, target_id, metadata
          FROM audit_events
          WHERE actor_type = 'ADMIN'
            AND actor_id = ${authUserId}
            AND action = 'catalog:product:update'
            AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
          ORDER BY timestamp DESC
          LIMIT 2;
        `)) as unknown as {
          actor_type: unknown;
          actor_id: unknown;
          action: unknown;
          target_type: unknown;
          target_id: unknown;
          metadata: unknown;
        }[];

        if (existingAuditRows.length > 1) {
          throw new CatalogReplayIntegrityError();
        }

        const replayAudit = existingAuditRows[0];
        if (replayAudit) {
          if (
            replayAudit.actor_type !== "ADMIN" ||
            replayAudit.actor_id !== authUserId ||
            replayAudit.action !== "catalog:product:update" ||
            replayAudit.target_type !== "product" ||
            replayAudit.target_id !== normalizedInput.productId ||
            !isPlainRecord(replayAudit.metadata)
          ) {
            throw new CatalogReplayIntegrityError();
          }

          const storedFingerprint = replayAudit.metadata.request_fingerprint;
          if (typeof storedFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(storedFingerprint)) {
            throw new CatalogReplayIntegrityError();
          }
          if (storedFingerprint !== requestFingerprint) {
            throw new CatalogIdempotencyConflictError();
          }

          const [durableProduct] = (await tx.execute(sql`
            SELECT * FROM products WHERE id = ${normalizedInput.productId}::uuid LIMIT 1;
          `)) as unknown as Record<string, unknown>[];
          if (!durableProduct) {
            throw new CatalogReplayIntegrityError();
          }

          return mapProductRow(durableProduct);
        }
      }

      // 1. Load current product under lock
      const currentRows = (await tx.execute(sql`
        SELECT * FROM products WHERE id = ${normalizedInput.productId}::uuid FOR UPDATE LIMIT 1;
      `)) as unknown as Record<string, unknown>[];

      if (!currentRows[0]) {
        throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
      }

      const current = mapProductRow(currentRows[0]);

      // 2. Exact Optimistic Concurrency Check (no 1000ms window)
      const expectedTime = new Date(normalizedInput.expectedUpdatedAt).getTime();
      const actualTime = new Date(current.updatedAt).getTime();
      if (Number.isNaN(expectedTime)) {
        throw new CatalogDomainError(
          "El timestamp expectedUpdatedAt es inválido.",
          "INVALID_TIMESTAMP",
          400
        );
      }
      if (expectedTime !== actualTime) {
        throw new StaleWriteConflictError();
      }

      // 3. Prepare updated values
      let targetName = current.name;
      if (normalizedInput.name !== undefined) {
        const trimmedName = normalizedInput.name.trim();
        if (!trimmedName || trimmedName.length > 200) {
          throw new CatalogDomainError(
            "El nombre del producto no puede estar vacío ni exceder 200 caracteres.",
            "INVALID_PRODUCT_NAME"
          );
        }
        targetName = trimmedName;
      }

      let targetSlug = current.slug;
      if (normalizedInput.slug !== undefined) {
        const trimmedSlug = normalizedInput.slug.trim().toLowerCase();
        if (!trimmedSlug || !PRODUCT_SLUG_REGEX.test(trimmedSlug) || trimmedSlug.length > 200) {
          throw new CatalogDomainError(
            "El slug del producto contiene caracteres inválidos.",
            "INVALID_PRODUCT_SLUG"
          );
        }
        if (trimmedSlug !== current.slug) {
          const slugCheck = (await tx.execute(sql`
            SELECT id FROM products WHERE slug = ${trimmedSlug} AND id <> ${current.id} LIMIT 1;
          `)) as unknown as { id: string }[];
          if (slugCheck[0]) {
            throw new CatalogDomainError(
              `El slug "${trimmedSlug}" ya está en uso por otro producto.`,
              "SLUG_CONFLICT",
              409
            );
          }
          targetSlug = trimmedSlug;
        }
      }

      let targetBrandId = current.brandId;
      if (normalizedInput.brandId !== undefined && normalizedInput.brandId !== current.brandId) {
        const bRows = (await tx.execute(sql`
          SELECT status FROM brands WHERE id = ${normalizedInput.brandId}::uuid LIMIT 1;
        `)) as unknown as { status: string }[];
        if (!bRows[0] || bRows[0].status !== "PUBLISHED") {
          throw new CatalogDomainError(
            "La marca seleccionada no existe o no está publicada.",
            "INVALID_BRAND"
          );
        }
        targetBrandId = normalizedInput.brandId;
      }

      let targetCategoryId = current.categoryId;
      if (
        normalizedInput.categoryId !== undefined &&
        normalizedInput.categoryId !== current.categoryId
      ) {
        const requestedCategoryId = normalizedInput.categoryId;
        const cRows = (await tx.execute(sql`
          SELECT status, current_spec_schema_id FROM categories WHERE id = ${requestedCategoryId}::uuid LIMIT 1;
        `)) as unknown as { status: string; current_spec_schema_id: string | null }[];

        if (!cRows[0] || cRows[0].status !== "PUBLISHED") {
          throw new CatalogDomainError(
            "La categoría seleccionada no existe o no está publicada.",
            "INVALID_CATEGORY"
          );
        }
        targetCategoryId = requestedCategoryId;

        // CATEGORY-CHANGE SPECIFICATION RECONCILIATION
        // Authoritative resolver: if pointer is NULL -> clear specs; if pointer non-null but invalid -> throws and aborts transaction!
        const { hasSchema, schema: newSchema } =
          await resolveAuthoritativeCategorySpecificationSchema(targetCategoryId, tx);

        if (!hasSchema) {
          // Clear specifications
          await tx.execute(sql`
            DELETE FROM product_specifications WHERE product_id = ${current.id}::uuid;
          `);
        } else {
          let valuesToPersist: Record<string, unknown> = {};

          if (normalizedInput.specValues) {
            const validation = validateProductSpecificationValues(
              newSchema!.fieldDefinitions,
              normalizedInput.specValues
            );
            if (!validation.success) {
              throw new CatalogDomainError(
                validation.error ?? "Valores de especificaciones inválidos.",
                validation.code ?? "INVALID_SPECS"
              );
            }
            valuesToPersist = validation.specValues ?? {};
          }

          await tx.execute(sql`
            INSERT INTO product_specifications (
              product_id, schema_id, schema_version, spec_values, updated_at
            ) VALUES (
              ${current.id}::uuid,
              ${newSchema!.id}::uuid,
              ${newSchema!.schemaVersion},
              ${JSON.stringify(valuesToPersist)}::jsonb,
              NOW()
            )
            ON CONFLICT (product_id) DO UPDATE SET
              schema_id = EXCLUDED.schema_id,
              schema_version = EXCLUDED.schema_version,
              spec_values = EXCLUDED.spec_values,
              updated_at = NOW();
          `);
        }
      } else if (normalizedInput.specValues !== undefined && normalizedInput.specValues !== null) {
        // Specification update without category change
        const { hasSchema, schema: activeSchema } =
          await resolveAuthoritativeCategorySpecificationSchema(current.categoryId, tx);

        if (!hasSchema) {
          throw new CatalogDomainError(
            "La categoría del producto no tiene un esquema de especificaciones activo.",
            "NO_SPEC_SCHEMA",
            422
          );
        }

        const validation = validateProductSpecificationValues(
          activeSchema!.fieldDefinitions,
          normalizedInput.specValues
        );
        if (!validation.success) {
          throw new CatalogDomainError(
            validation.error ?? "Valores de especificaciones inválidos.",
            validation.code ?? "INVALID_SPECS"
          );
        }

        await tx.execute(sql`
          INSERT INTO product_specifications (
            product_id, schema_id, schema_version, spec_values, updated_at
          ) VALUES (
            ${current.id}::uuid,
            ${activeSchema!.id}::uuid,
            ${activeSchema!.schemaVersion},
            ${JSON.stringify(validation.specValues ?? {})}::jsonb,
            NOW()
          )
          ON CONFLICT (product_id) DO UPDATE SET
            schema_id = EXCLUDED.schema_id,
            schema_version = EXCLUDED.schema_version,
            spec_values = EXCLUDED.spec_values,
            updated_at = NOW();
        `);
      }

      const targetSubtitle =
        normalizedInput.subtitle !== undefined
          ? (normalizedInput.subtitle?.trim() ?? null)
          : current.subtitle;
      const targetDescription =
        normalizedInput.description !== undefined
          ? (normalizedInput.description?.trim() ?? null)
          : current.description;
      const targetIsFeatured =
        normalizedInput.isFeatured !== undefined
          ? Boolean(normalizedInput.isFeatured)
          : current.isFeatured;

      // Update Product
      const [rawUpdated] = (await tx.execute(sql`
        UPDATE products SET
          name = ${targetName},
          slug = ${targetSlug},
          brand_id = ${targetBrandId}::uuid,
          category_id = ${targetCategoryId}::uuid,
          subtitle = ${targetSubtitle},
          description = ${targetDescription},
          is_featured = ${targetIsFeatured},
          updated_at = NOW()
        WHERE id = ${current.id}::uuid
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawUpdated) {
        throw new CatalogDomainError("No se pudo actualizar el producto.", "UPDATE_FAILED", 500);
      }

      const updatedProduct = mapProductRow(rawUpdated);

      const auditMetadata: Record<string, unknown> = {
        before: {
          name: current.name,
          slug: current.slug,
          brandId: current.brandId,
          categoryId: current.categoryId,
        },
        after: {
          name: targetName,
          slug: targetSlug,
          brandId: targetBrandId,
          categoryId: targetCategoryId,
        },
      };
      if (mutationRequestDigest) {
        auditMetadata.mutation_request_digest = mutationRequestDigest;
      }
      if (requestFingerprint) {
        auditMetadata.request_fingerprint = requestFingerprint;
      }

      // Insert AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          'catalog:product:update',
          'product',
          ${current.id},
          ${JSON.stringify(auditMetadata)}::jsonb,
          NULL
        );
      `);

      return updatedProduct;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}

/**
 * Creates a new ProductVariant for an existing Product.
 */
export async function createVariant(
  input: CreateVariantInput,
  options?: ServiceOptions
): Promise<ProductVariant> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  const validated = validateProductVariantInput(input, "create");

  // Idempotency Digests
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      "catalog:variant:create",
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint({
      attributes: validated.attributes,
      compareAtPriceCents: validated.compareAtPriceCents,
      costCents: validated.costCents,
      displayOrder: validated.displayOrder,
      priceCents: validated.priceCents,
      productId: input.productId,
      sku: validated.sku,
      status: validated.status,
      title: validated.title,
      weightGrams: validated.weightGrams,
    });
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

  try {
    return await db.transaction(async (tx): Promise<ProductVariant> => {
      // Replay lookup under lock
      if (lockKey !== null && mutationRequestDigest) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

        const existingAuditRows = (await tx.execute(sql`
          SELECT * FROM audit_events
          WHERE actor_id = ${authUserId}
            AND action = 'catalog:variant:create'
            AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
          ORDER BY timestamp DESC
          LIMIT 1;
        `)) as unknown as {
          target_type: string;
          target_id: string;
          metadata: { request_fingerprint?: string };
        }[];

        if (existingAuditRows[0]) {
          const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
          if (storedFingerprint !== requestFingerprint) {
            throw new CatalogIdempotencyConflictError();
          }

          if (existingAuditRows[0].target_type !== "product_variant") {
            throw new CatalogReplayIntegrityError();
          }

          const targetVariantId = existingAuditRows[0].target_id;
          const [targetVarRow] = (await tx.execute(sql`
            SELECT * FROM product_variants WHERE id = ${targetVariantId}::uuid LIMIT 1;
          `)) as unknown as Record<string, unknown>[];

          if (!targetVarRow || String(targetVarRow.product_id) !== input.productId) {
            throw new CatalogReplayIntegrityError();
          }

          return mapVariantRow(targetVarRow);
        }
      }

      // Verify Product exists
      const prodRows = (await tx.execute(sql`
        SELECT id FROM products WHERE id = ${input.productId}::uuid LIMIT 1;
      `)) as unknown as { id: string }[];

      if (!prodRows[0]) {
        throw new CatalogDomainError("El producto asignado no existe.", "PRODUCT_NOT_FOUND", 404);
      }

      // Check SKU uniqueness
      const skuConflict = (await tx.execute(sql`
        SELECT id FROM product_variants WHERE sku = ${validated.sku} LIMIT 1;
      `)) as unknown as { id: string }[];

      if (skuConflict[0]) {
        throw new CatalogDomainError(
          `El SKU "${validated.sku}" ya está registrado en el sistema.`,
          "SKU_CONFLICT",
          409
        );
      }

      const variantId = generateUuidV7();

      const [rawCreated] = (await tx.execute(sql`
        INSERT INTO product_variants (
          id, product_id, sku, title, price_cents, compare_at_price_cents, cost_cents,
          weight_grams, attributes, status, display_order, created_at, updated_at
        ) VALUES (
          ${variantId}::uuid,
          ${input.productId}::uuid,
          ${validated.sku},
          ${validated.title},
          ${validated.priceCents},
          ${validated.compareAtPriceCents},
          ${validated.costCents},
          ${validated.weightGrams},
          ${JSON.stringify(validated.attributes)}::jsonb,
          ${validated.status},
          ${validated.displayOrder},
          NOW(),
          NOW()
        )
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawCreated) {
        throw new CatalogDomainError("No se pudo crear la variante.", "CREATE_FAILED", 500);
      }

      const createdVariant = mapVariantRow(rawCreated);

      // Insert AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      const auditMetadata: Record<string, unknown> = {
        product_id: input.productId,
        sku: validated.sku,
        title: validated.title,
        price_cents: validated.priceCents,
      };
      if (mutationRequestDigest) auditMetadata.mutation_request_digest = mutationRequestDigest;
      if (requestFingerprint) auditMetadata.request_fingerprint = requestFingerprint;

      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          'catalog:variant:create',
          'product_variant',
          ${variantId},
          ${JSON.stringify(auditMetadata)}::jsonb,
          NULL
        );
      `);

      return createdVariant;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}

/**
 * Updates an existing ProductVariant.
 * Enforces optimistic concurrency and permanent SKU Immutability if inventory or order history exists.
 */
export async function updateVariant(
  input: UpdateVariantInput,
  options?: ServiceOptions
): Promise<ProductVariant> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  try {
    return await db.transaction(async (tx): Promise<ProductVariant> => {
      // 1. Load current variant under lock
      const currentRows = (await tx.execute(sql`
        SELECT * FROM product_variants WHERE id = ${input.variantId}::uuid FOR UPDATE LIMIT 1;
      `)) as unknown as Record<string, unknown>[];

      if (!currentRows[0]) {
        throw new CatalogDomainError("La variante no existe.", "VARIANT_NOT_FOUND", 404);
      }

      const current = mapVariantRow(currentRows[0]);

      // 2. Exact Optimistic Concurrency Check (no 1000ms tolerance)
      const expectedTime = new Date(input.expectedUpdatedAt).getTime();
      const actualTime = new Date(current.updatedAt).getTime();
      if (Number.isNaN(expectedTime)) {
        throw new CatalogDomainError(
          "El timestamp expectedUpdatedAt es inválido.",
          "INVALID_TIMESTAMP",
          400
        );
      }
      if (expectedTime !== actualTime) {
        throw new StaleWriteConflictError();
      }

      // 3. Assemble and validate target variant state using canonical validator
      const candidateTarget: RawVariantInput = {
        sku: input.sku ?? current.sku,
        title: input.title ?? current.title,
        priceCents: input.priceCents ?? current.priceCents,
        compareAtPriceCents:
          input.compareAtPriceCents !== undefined
            ? input.compareAtPriceCents
            : current.compareAtPriceCents,
        costCents: input.costCents !== undefined ? input.costCents : current.costCents,
        weightGrams: input.weightGrams !== undefined ? input.weightGrams : current.weightGrams,
        displayOrder: input.displayOrder ?? current.displayOrder,
        status: input.status ?? current.status,
        attributes: input.attributes ?? current.attributes,
      };

      const validated = validateProductVariantInput(candidateTarget, "update");

      // 4. SKU Immutability Rule Enforcement
      if (validated.sku !== current.sku) {
        // Check if ANY inventory_items or order_items exist
        const historyRows = (await tx.execute(sql`
          SELECT
            (EXISTS(SELECT 1 FROM inventory_items WHERE variant_id = ${current.id}::uuid)) AS has_inventory,
            (EXISTS(SELECT 1 FROM order_items WHERE variant_id = ${current.id}::uuid)) AS has_orders;
        `)) as unknown as { has_inventory: boolean; has_orders: boolean }[];

        if (historyRows[0]?.has_inventory || historyRows[0]?.has_orders) {
          throw new SkuImmutableError();
        }

        // Check uniqueness for new SKU
        const conflictRows = (await tx.execute(sql`
          SELECT id FROM product_variants WHERE sku = ${validated.sku} AND id <> ${current.id} LIMIT 1;
        `)) as unknown as { id: string }[];

        if (conflictRows[0]) {
          throw new CatalogDomainError(
            `El SKU "${validated.sku}" ya está registrado en el sistema.`,
            "SKU_CONFLICT",
            409
          );
        }
      }

      const [rawUpdated] = (await tx.execute(sql`
        UPDATE product_variants SET
          sku = ${validated.sku},
          title = ${validated.title},
          price_cents = ${validated.priceCents},
          compare_at_price_cents = ${validated.compareAtPriceCents},
          cost_cents = ${validated.costCents},
          weight_grams = ${validated.weightGrams},
          attributes = ${JSON.stringify(validated.attributes)}::jsonb,
          status = ${validated.status},
          display_order = ${validated.displayOrder},
          updated_at = NOW()
        WHERE id = ${current.id}::uuid
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawUpdated) {
        throw new CatalogDomainError("No se pudo actualizar la variante.", "UPDATE_FAILED", 500);
      }

      const updatedVariant = mapVariantRow(rawUpdated);

      // Insert AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          'catalog:variant:update',
          'product_variant',
          ${current.id},
          ${JSON.stringify({
            before: { sku: current.sku, title: current.title, price_cents: current.priceCents },
            after: {
              sku: validated.sku,
              title: validated.title,
              price_cents: validated.priceCents,
            },
          })}::jsonb,
          NULL
        );
      `);

      return updatedVariant;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}

/**
 * Transitions Product Status (DRAFT, PUBLISHED, ARCHIVED).
 * Enforces canonical RBAC permissions (catalog:publish required for publish/unpublish)
 * derived exclusively from the authoritative LOCKED row state to close TOCTOU race conditions.
 */
export async function transitionProductStatus(
  input: StatusTransitionInput,
  options?: ServiceOptions
): Promise<Product> {
  // 1. Authenticate the current actor & 2. Obtain authoritative permission context
  const authContext = await resolveAuthContext(options);
  const authUserId = authContext.authUserId;

  // Idempotency Digests (computed before transaction so advisory lock key is ready)
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      `catalog:product:${input.targetStatus.toLowerCase()}`,
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint({
      requestedTargetStatus: input.targetStatus,
      targetProductId: input.productId,
    });
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

  try {
    return await db.transaction(async (tx): Promise<Product> => {
      // 4. Acquire any idempotency advisory lock required
      if (lockKey !== null && mutationRequestDigest) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);
      }

      // 5. SELECT Product ... FOR UPDATE (authoritative locked state)
      const [rawProduct] = (await tx.execute(sql`
        SELECT * FROM products WHERE id = ${input.productId}::uuid FOR UPDATE LIMIT 1;
      `)) as unknown as Record<string, unknown>[];

      if (!rawProduct) {
        throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
      }
      const product = mapProductRow(rawProduct);

      // 6. Use the LOCKED current status + requested target status to determine required permission
      // Canonical Status Permission Matrix:
      // DRAFT -> PUBLISHED: catalog:publish
      // ARCHIVED -> PUBLISHED: catalog:publish
      // PUBLISHED -> DRAFT: catalog:publish
      // PUBLISHED -> ARCHIVED: catalog:publish
      // DRAFT -> ARCHIVED: catalog:manage
      // ARCHIVED -> DRAFT: catalog:manage
      // Same target PUBLISHED: catalog:publish
      // Same target DRAFT or ARCHIVED: catalog:manage
      let requiredPermission: "catalog:manage" | "catalog:publish";
      if (input.targetStatus === "PUBLISHED" || product.status === "PUBLISHED") {
        requiredPermission = "catalog:publish";
      } else {
        requiredPermission = "catalog:manage";
      }

      // 7. Assert required permission against verified server-side permission set
      if (!authContext.permissions.has(requiredPermission)) {
        throw new CatalogDomainError(
          "No tienes permisos suficientes para realizar esta transición de estado.",
          "FORBIDDEN",
          403
        );
      }

      // 8. Replay lookup under lock
      if (lockKey !== null && mutationRequestDigest) {
        const existingAuditRows = (await tx.execute(sql`
          SELECT * FROM audit_events
          WHERE actor_id = ${authUserId}
            AND action LIKE 'catalog:product:%'
            AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
          ORDER BY timestamp DESC
          LIMIT 1;
        `)) as unknown as {
          target_type: string;
          target_id: string;
          metadata: { request_fingerprint?: string };
        }[];

        if (existingAuditRows[0]) {
          const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
          if (storedFingerprint !== requestFingerprint) {
            throw new CatalogIdempotencyConflictError();
          }

          if (existingAuditRows[0].target_type !== "product") {
            throw new CatalogReplayIntegrityError();
          }

          if (existingAuditRows[0].target_id !== product.id) {
            throw new CatalogReplayIntegrityError();
          }

          return product;
        }
      }

      // Exact Optimistic Concurrency Check (no tolerance window)
      const expectedTime = new Date(input.expectedUpdatedAt).getTime();
      const actualTime = new Date(product.updatedAt).getTime();
      if (Number.isNaN(expectedTime)) {
        throw new CatalogDomainError(
          "El timestamp expectedUpdatedAt es inválido.",
          "INVALID_TIMESTAMP",
          400
        );
      }
      if (expectedTime !== actualTime) {
        throw new StaleWriteConflictError();
      }

      // Target-state idempotency inside transaction
      if (product.status === input.targetStatus) {
        return product;
      }

      // If transitioning to PUBLISHED, execute Publish Readiness Validator
      if (input.targetStatus === "PUBLISHED") {
        const detail = await loadInternalProductDetail(product.id, tx);

        if (!detail || !detail.publishReadiness.isPublishable) {
          const firstBlocker = detail?.publishReadiness.blockers[0];
          throw new CatalogDomainError(
            firstBlocker?.message ?? "El producto no cumple con los requisitos de publicación.",
            firstBlocker?.code ?? "PUBLISH_READINESS_FAILED",
            422
          );
        }
      }

      // Update Status in database
      const [rawUpdated] = (await tx.execute(sql`
        UPDATE products SET
          status = ${input.targetStatus},
          updated_at = NOW()
        WHERE id = ${product.id}::uuid
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawUpdated) {
        throw new CatalogDomainError(
          "No se pudo actualizar el estado del producto.",
          "UPDATE_FAILED",
          500
        );
      }

      const updatedProduct = mapProductRow(rawUpdated);

      // Action string mapping using LOCKED product.status
      let actionString = "catalog:product:update_status";
      if (input.targetStatus === "PUBLISHED") actionString = "catalog:product:publish";
      else if (product.status === "PUBLISHED" && input.targetStatus === "DRAFT")
        actionString = "catalog:product:unpublish";
      else if (input.targetStatus === "ARCHIVED") actionString = "catalog:product:archive";
      else if (product.status === "ARCHIVED" && input.targetStatus === "DRAFT")
        actionString = "catalog:product:restore";

      const auditMetadata: Record<string, unknown> = {
        from_status: product.status,
        to_status: input.targetStatus,
      };
      if (mutationRequestDigest) auditMetadata.mutation_request_digest = mutationRequestDigest;
      if (requestFingerprint) auditMetadata.request_fingerprint = requestFingerprint;

      // AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          ${actionString},
          'product',
          ${product.id},
          ${JSON.stringify(auditMetadata)}::jsonb,
          NULL
        );
      `);

      return updatedProduct;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}

/**
 * Duplicates an existing Product, creating a new DRAFT Product, cloning all variants with new IDs,
 * remapping variant-specific media to the cloned variants, and cloning specifications.
 * Strictly transactional: zero inventory, orders, or story content are duplicated.
 */
export async function duplicateProduct(
  input: DuplicateProductInput,
  options?: ServiceOptions
): Promise<Product> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  // Normalize customName and customSlug
  const normalizedCustomName =
    typeof input.options?.customName === "string" && input.options.customName.trim().length > 0
      ? input.options.customName.trim()
      : null;
  const rawCustomSlug =
    typeof input.options?.customSlug === "string" && input.options.customSlug.trim().length > 0
      ? input.options.customSlug.trim().toLowerCase()
      : null;
  const normalizedCustomSlug =
    rawCustomSlug && PRODUCT_SLUG_REGEX.test(rawCustomSlug) ? rawCustomSlug : null;

  const normalizedDuplicatePayload = {
    customName: normalizedCustomName,
    customSlug: normalizedCustomSlug,
    sourceProductId: input.sourceProductId,
  };

  // Idempotency Digests
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      "catalog:product:duplicate",
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint(normalizedDuplicatePayload);
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

  try {
    return await db.transaction(async (tx): Promise<Product> => {
      // Replay lookup under lock
      if (lockKey !== null && mutationRequestDigest) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

        const existingAuditRows = (await tx.execute(sql`
          SELECT * FROM audit_events
          WHERE actor_id = ${authUserId}
            AND action = 'catalog:product:duplicate'
            AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
          ORDER BY timestamp DESC
          LIMIT 1;
        `)) as unknown as {
          target_type: string;
          target_id: string;
          metadata: { request_fingerprint?: string };
        }[];

        if (existingAuditRows[0]) {
          const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
          if (storedFingerprint !== requestFingerprint) {
            throw new CatalogIdempotencyConflictError();
          }

          if (existingAuditRows[0].target_type !== "product") {
            throw new CatalogReplayIntegrityError();
          }

          const [targetProdRow] = (await tx.execute(sql`
            SELECT * FROM products WHERE id = ${existingAuditRows[0].target_id}::uuid LIMIT 1;
          `)) as unknown as Record<string, unknown>[];

          if (!targetProdRow) {
            throw new CatalogReplayIntegrityError();
          }

          return mapProductRow(targetProdRow);
        }
      }

      // 1. Load source product
      const sourceRows = (await tx.execute(sql`
        SELECT * FROM products WHERE id = ${input.sourceProductId}::uuid LIMIT 1;
      `)) as unknown as Record<string, unknown>[];

      if (!sourceRows[0]) {
        throw new CatalogDomainError(
          "El producto de origen no existe.",
          "SOURCE_PRODUCT_NOT_FOUND",
          404
        );
      }

      const source = mapProductRow(sourceRows[0]);

      // 2. Derive duplicate name and unique slug
      const duplicateName = normalizedCustomName ?? `${source.name} (Copia)`;
      const baseDuplicateSlug = normalizedCustomSlug ?? `${source.slug}-copia`;

      // Check slug uniqueness and append counter if necessary
      let duplicateSlug = baseDuplicateSlug;
      let slugSuffix = 1;
      while (true) {
        const conflict = (await tx.execute(sql`
          SELECT id FROM products WHERE slug = ${duplicateSlug} LIMIT 1;
        `)) as unknown as { id: string }[];

        if (!conflict[0]) {
          break;
        }
        duplicateSlug = `${baseDuplicateSlug}-${slugSuffix}`;
        slugSuffix++;
      }

      const newProductId = generateUuidV7();

      // 3. Insert Cloned Product (Canonically DRAFT, is_featured FALSE)
      const [rawNewProduct] = (await tx.execute(sql`
        INSERT INTO products (
          id, brand_id, category_id, name, slug, subtitle, description, status, is_featured, created_at, updated_at
        ) VALUES (
          ${newProductId}::uuid,
          ${source.brandId}::uuid,
          ${source.categoryId}::uuid,
          ${duplicateName},
          ${duplicateSlug},
          ${source.subtitle},
          ${source.description},
          'DRAFT',
          FALSE,
          NOW(),
          NOW()
        )
        RETURNING *;
      `)) as unknown as Record<string, unknown>[];

      if (!rawNewProduct) {
        throw new CatalogDomainError("Fallo al duplicar el producto.", "DUPLICATE_FAILED", 500);
      }

      const duplicatedProduct = mapProductRow(rawNewProduct);

      // 4. Clone Variants (Generating new IDs and SKUs, preserving pricing and attributes)
      const sourceVariants = (await tx.execute(sql`
        SELECT * FROM product_variants WHERE product_id = ${source.id}::uuid ORDER BY display_order ASC;
      `)) as unknown as Record<string, unknown>[];

      const variantIdMap = new Map<string, string>(); // oldVariantId -> newVariantId

      for (const rawVar of sourceVariants) {
        const sv = mapVariantRow(rawVar);
        const newVariantId = generateUuidV7();
        variantIdMap.set(sv.id, newVariantId);

        // Derive unique SKU for duplicate variant
        let duplicateSku = `${sv.sku}-COPY`;
        let skuSuffix = 1;
        while (true) {
          const skuConflict = (await tx.execute(sql`
            SELECT id FROM product_variants WHERE sku = ${duplicateSku} LIMIT 1;
          `)) as unknown as { id: string }[];

          if (!skuConflict[0]) {
            break;
          }
          duplicateSku = `${sv.sku}-COPY-${skuSuffix}`;
          skuSuffix++;
        }

        await tx.execute(sql`
          INSERT INTO product_variants (
            id, product_id, sku, title, price_cents, compare_at_price_cents, cost_cents,
            weight_grams, attributes, status, display_order, created_at, updated_at
          ) VALUES (
            ${newVariantId}::uuid,
            ${newProductId}::uuid,
            ${duplicateSku},
            ${sv.title},
            ${sv.priceCents},
            ${sv.compareAtPriceCents ?? null},
            ${sv.costCents ?? null},
            ${sv.weightGrams ?? null},
            ${JSON.stringify(sv.attributes ?? {})}::jsonb,
            ${sv.status},
            ${sv.displayOrder},
            NOW(),
            NOW()
          );
        `);
      }

      // 5. Clone Specifications
      const specRows = (await tx.execute(sql`
        SELECT * FROM product_specifications WHERE product_id = ${source.id}::uuid LIMIT 1;
      `)) as unknown as {
        schema_id: string;
        schema_version: number;
        spec_values: Record<string, unknown>;
      }[];

      if (specRows[0]) {
        await tx.execute(sql`
          INSERT INTO product_specifications (
            product_id, schema_id, schema_version, spec_values, updated_at
          ) VALUES (
            ${newProductId}::uuid,
            ${specRows[0].schema_id}::uuid,
            ${specRows[0].schema_version},
            ${JSON.stringify(specRows[0].spec_values ?? {})}::jsonb,
            NOW()
          );
        `);
      }

      // 6. Duplicate Media with Variant Remapping
      const sourceMedia = (await tx.execute(sql`
        SELECT * FROM product_media WHERE product_id = ${source.id}::uuid ORDER BY display_order ASC;
      `)) as unknown as {
        id: string;
        media_asset_id: string;
        variant_id: string | null;
        display_order: number;
      }[];

      let newPrimaryMediaId: string | null = null;

      for (const sm of sourceMedia) {
        let targetVariantId: string | null = null;

        if (sm.variant_id !== null) {
          const mapped = variantIdMap.get(sm.variant_id);
          if (!mapped) {
            throw new CatalogDomainError(
              "Fallo de integridad: variante asociada a la imagen no pudo ser mapeada.",
              "VARIANT_MAPPING_FAILED",
              500
            );
          }
          targetVariantId = mapped;
        } else {
          // Global media: check if this was the primary media
          if (source.primaryMediaId === sm.media_asset_id) {
            newPrimaryMediaId = sm.media_asset_id;
          }
        }

        await tx.execute(sql`
          INSERT INTO product_media (
            id, product_id, media_asset_id, variant_id, display_order, created_at
          ) VALUES (
            ${generateUuidV7()}::uuid,
            ${newProductId}::uuid,
            ${sm.media_asset_id}::uuid,
            ${targetVariantId ? sql`${targetVariantId}::uuid` : sql`NULL`},
            ${sm.display_order},
            NOW()
          );
        `);
      }

      // If source primary media was attached globally, link it on the duplicate
      if (newPrimaryMediaId) {
        await tx.execute(sql`
          UPDATE products SET primary_media_id = ${newPrimaryMediaId}::uuid WHERE id = ${newProductId}::uuid;
        `);
        duplicatedProduct.primaryMediaId = newPrimaryMediaId;
      }

      // 7. Insert AuditEvent: request_id is NULL (raw mutationRequestId is NOT persisted)
      const auditMetadata: Record<string, unknown> = {
        source_product_id: source.id,
        duplicate_product_id: newProductId,
        name: duplicateName,
        slug: duplicateSlug,
      };
      if (mutationRequestDigest) auditMetadata.mutation_request_digest = mutationRequestDigest;
      if (requestFingerprint) auditMetadata.request_fingerprint = requestFingerprint;

      await tx.execute(sql`
        INSERT INTO audit_events (
          id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
        ) VALUES (
          ${generateUuidV7()}::uuid,
          NOW(),
          'ADMIN',
          ${authUserId},
          'catalog:product:duplicate',
          'product',
          ${newProductId},
          ${JSON.stringify(auditMetadata)}::jsonb,
          NULL
        );
      `);

      return duplicatedProduct;
    });
  } catch (err) {
    handleDatabaseError(err);
  }
}
