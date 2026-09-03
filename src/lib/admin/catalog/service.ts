import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import type { Product, ProductVariant } from "@/db/schema";
import type {
  CreateProductInput,
  CreateVariantInput,
  DuplicateProductInput,
  StatusTransitionInput,
  UpdateProductInput,
  UpdateVariantInput,
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
import { validateProductSpecificationValues } from "./specifications";
import { PRODUCT_SLUG_REGEX } from "./publish-readiness";
import { getAdminProductDetail } from "./readers";
import type { SpecificationFieldDefinition } from "@/db/schema";

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

  // Idempotency Digests
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      "catalog:product:create",
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint({
      brandId: input.brandId,
      categoryId: input.categoryId,
      description: input.description ?? null,
      initialVariant: input.initialVariant ?? null,
      isFeatured: Boolean(input.isFeatured),
      name: trimmedName,
      slug: trimmedSlug,
      subtitle: input.subtitle ?? null,
    });
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

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
      `)) as unknown as { target_id: string; metadata: { request_fingerprint?: string } }[];

      if (existingAuditRows[0]) {
        const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
        if (storedFingerprint !== requestFingerprint) {
          throw new CatalogIdempotencyConflictError();
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
      SELECT status FROM brands WHERE id = ${input.brandId}::uuid LIMIT 1;
    `)) as unknown as { status: string }[];

    if (!brandRows[0] || brandRows[0].status !== "PUBLISHED") {
      throw new CatalogDomainError(
        "La marca seleccionada no existe o no está publicada.",
        "INVALID_BRAND"
      );
    }

    // Verify Category exists and is PUBLISHED
    const categoryRows = (await tx.execute(sql`
      SELECT status FROM categories WHERE id = ${input.categoryId}::uuid LIMIT 1;
    `)) as unknown as { status: string }[];

    if (!categoryRows[0] || categoryRows[0].status !== "PUBLISHED") {
      throw new CatalogDomainError(
        "La categoría seleccionada no existe o no está publicada.",
        "INVALID_CATEGORY"
      );
    }

    // Check slug uniqueness
    const slugConflictRows = (await tx.execute(sql`
      SELECT id FROM products WHERE slug = ${trimmedSlug} LIMIT 1;
    `)) as unknown as { id: string }[];

    if (slugConflictRows[0]) {
      throw new CatalogDomainError(
        `El slug "${trimmedSlug}" ya está en uso por otro producto.`,
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
        ${input.brandId}::uuid,
        ${input.categoryId}::uuid,
        ${trimmedName},
        ${trimmedSlug},
        ${input.subtitle?.trim() ?? null},
        ${input.description?.trim() ?? null},
        'DRAFT',
        ${Boolean(input.isFeatured)},
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
    if (input.initialVariant) {
      const v = input.initialVariant;
      const vSku = v.sku.trim();
      const vTitle = v.title.trim();

      if (!vSku || vSku.length > 50) {
        throw new CatalogDomainError(
          "El SKU de la variante debe tener entre 1 y 50 caracteres.",
          "INVALID_VARIANT_SKU"
        );
      }
      if (!vTitle || vTitle.length > 150) {
        throw new CatalogDomainError(
          "El título de la variante debe tener entre 1 y 150 caracteres.",
          "INVALID_VARIANT_TITLE"
        );
      }
      if (!v.priceCents || v.priceCents <= 0) {
        throw new CatalogDomainError(
          "El precio de la variante debe ser mayor a 0.",
          "INVALID_VARIANT_PRICE"
        );
      }

      // Check SKU uniqueness
      const skuConflictRows = (await tx.execute(sql`
        SELECT id FROM product_variants WHERE sku = ${vSku} LIMIT 1;
      `)) as unknown as { id: string }[];

      if (skuConflictRows[0]) {
        throw new CatalogDomainError(
          `El SKU "${vSku}" ya está registrado en el sistema.`,
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
          ${vSku},
          ${vTitle},
          ${v.priceCents},
          ${v.compareAtPriceCents ?? null},
          ${v.costCents ?? null},
          ${v.weightGrams ?? null},
          ${JSON.stringify(v.attributes ?? {})}::jsonb,
          'ACTIVE',
          0,
          NOW(),
          NOW()
        );
      `);
    }

    // Insert Transactional AuditEvent
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
        ${input.mutationRequestId ?? null}
      );
    `);

    return createdProduct;
  });
}

/**
 * Updates an existing Product.
 * Handles optimistic concurrency, Brand/Category validation, and Category-change specification reconciliation.
 */
export async function updateProduct(
  input: UpdateProductInput,
  options?: ServiceOptions
): Promise<Product> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  return await db.transaction(async (tx): Promise<Product> => {
    // 1. Load current product under lock
    const currentRows = (await tx.execute(sql`
      SELECT * FROM products WHERE id = ${input.productId}::uuid FOR UPDATE LIMIT 1;
    `)) as unknown as Record<string, unknown>[];

    if (!currentRows[0]) {
      throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
    }

    const current = mapProductRow(currentRows[0]);

    // 2. Optimistic Concurrency Check
    const expectedTime = new Date(input.expectedUpdatedAt).getTime();
    const actualTime = new Date(current.updatedAt).getTime();
    if (Math.abs(expectedTime - actualTime) > 1000) {
      throw new StaleWriteConflictError();
    }

    // 3. Prepare updated values
    let targetName = current.name;
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length > 200) {
        throw new CatalogDomainError(
          "El nombre del producto no puede estar vacío ni exceder 200 caracteres.",
          "INVALID_PRODUCT_NAME"
        );
      }
      targetName = trimmedName;
    }

    let targetSlug = current.slug;
    if (input.slug !== undefined) {
      const trimmedSlug = input.slug.trim().toLowerCase();
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
    if (input.brandId !== undefined && input.brandId !== current.brandId) {
      const bRows = (await tx.execute(sql`
        SELECT status FROM brands WHERE id = ${input.brandId}::uuid LIMIT 1;
      `)) as unknown as { status: string }[];
      if (!bRows[0] || bRows[0].status !== "PUBLISHED") {
        throw new CatalogDomainError(
          "La marca seleccionada no existe o no está publicada.",
          "INVALID_BRAND"
        );
      }
      targetBrandId = input.brandId;
    }

    let targetCategoryId = current.categoryId;
    const categoryChanged =
      input.categoryId !== undefined && input.categoryId !== current.categoryId;

    if (categoryChanged) {
      const cRows = (await tx.execute(sql`
        SELECT status, current_spec_schema_id FROM categories WHERE id = ${input.categoryId}::uuid LIMIT 1;
      `)) as unknown as { status: string; current_spec_schema_id: string | null }[];

      if (!cRows[0] || cRows[0].status !== "PUBLISHED") {
        throw new CatalogDomainError(
          "La categoría seleccionada no existe o no está publicada.",
          "INVALID_CATEGORY"
        );
      }
      targetCategoryId = input.categoryId!;

      // CATEGORY-CHANGE SPECIFICATION RECONCILIATION
      const newSchemaId = cRows[0].current_spec_schema_id;
      if (!newSchemaId) {
        // Clear specifications
        await tx.execute(sql`
          DELETE FROM product_specifications WHERE product_id = ${current.id}::uuid;
        `);
      } else {
        const schemaRows = (await tx.execute(sql`
          SELECT * FROM category_specification_schemas WHERE id = ${newSchemaId}::uuid AND is_active = TRUE LIMIT 1;
        `)) as unknown as {
          schema_version: number;
          field_definitions: SpecificationFieldDefinition[];
        }[];

        if (!schemaRows[0]) {
          await tx.execute(
            sql`DELETE FROM product_specifications WHERE product_id = ${current.id}::uuid;`
          );
        } else {
          const newSchema = schemaRows[0];
          let valuesToPersist: Record<string, unknown> = {};

          if (input.specValues) {
            const validation = validateProductSpecificationValues(
              newSchema.field_definitions,
              input.specValues
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
              ${newSchemaId}::uuid,
              ${newSchema.schema_version},
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
      }
    } else if (input.specValues !== undefined && input.specValues !== null) {
      // Specification update without category change
      const catRows = (await tx.execute(sql`
        SELECT current_spec_schema_id FROM categories WHERE id = ${current.categoryId}::uuid LIMIT 1;
      `)) as unknown as { current_spec_schema_id: string | null }[];

      const schemaId = catRows[0]?.current_spec_schema_id;
      if (!schemaId) {
        throw new CatalogDomainError(
          "La categoría del producto no tiene un esquema de especificaciones activo.",
          "NO_SPEC_SCHEMA"
        );
      }

      const schemaRows = (await tx.execute(sql`
        SELECT * FROM category_specification_schemas WHERE id = ${schemaId}::uuid AND is_active = TRUE LIMIT 1;
      `)) as unknown as {
        schema_version: number;
        field_definitions: SpecificationFieldDefinition[];
      }[];

      if (!schemaRows[0]) {
        throw new CatalogDomainError(
          "El esquema de especificaciones no está disponible.",
          "SPEC_SCHEMA_UNAVAILABLE"
        );
      }

      const validation = validateProductSpecificationValues(
        schemaRows[0].field_definitions,
        input.specValues
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
          ${schemaId}::uuid,
          ${schemaRows[0].schema_version},
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
      input.subtitle !== undefined ? (input.subtitle?.trim() ?? null) : current.subtitle;
    const targetDescription =
      input.description !== undefined ? (input.description?.trim() ?? null) : current.description;
    const targetIsFeatured =
      input.isFeatured !== undefined ? Boolean(input.isFeatured) : current.isFeatured;

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

    // Insert AuditEvent
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
        ${JSON.stringify({
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
        })}::jsonb,
        ${input.mutationRequestId ?? null}
      );
    `);

    return updatedProduct;
  });
}

/**
 * Creates a new ProductVariant for an existing Product.
 */
export async function createVariant(
  input: CreateVariantInput,
  options?: ServiceOptions
): Promise<ProductVariant> {
  const { authUserId } = await resolveActorAndAssertPermission("catalog:manage", options);

  const trimmedSku = input.sku?.trim() ?? "";
  if (!trimmedSku || trimmedSku.length > 50) {
    throw new CatalogDomainError(
      "El SKU es obligatorio y debe tener como máximo 50 caracteres.",
      "INVALID_SKU"
    );
  }

  const trimmedTitle = input.title?.trim() ?? "";
  if (!trimmedTitle || trimmedTitle.length > 150) {
    throw new CatalogDomainError(
      "El título de la variante es obligatorio y debe tener como máximo 150 caracteres.",
      "INVALID_VARIANT_TITLE"
    );
  }

  if (!input.priceCents || input.priceCents <= 0) {
    throw new CatalogDomainError("El precio de venta debe ser mayor a 0.", "INVALID_PRICE");
  }

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
      attributes: input.attributes ?? {},
      compareAtPriceCents: input.compareAtPriceCents ?? null,
      costCents: input.costCents ?? null,
      displayOrder: input.displayOrder ?? 0,
      priceCents: input.priceCents,
      productId: input.productId,
      sku: trimmedSku,
      status: input.status ?? "ACTIVE",
      title: trimmedTitle,
      weightGrams: input.weightGrams ?? null,
    });
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

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
      `)) as unknown as { target_id: string; metadata: { request_fingerprint?: string } }[];

      if (existingAuditRows[0]) {
        const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
        if (storedFingerprint !== requestFingerprint) {
          throw new CatalogIdempotencyConflictError();
        }

        const targetVariantId = existingAuditRows[0].target_id;
        const [targetVarRow] = (await tx.execute(sql`
          SELECT * FROM product_variants WHERE id = ${targetVariantId}::uuid LIMIT 1;
        `)) as unknown as Record<string, unknown>[];

        if (!targetVarRow) {
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
      SELECT id FROM product_variants WHERE sku = ${trimmedSku} LIMIT 1;
    `)) as unknown as { id: string }[];

    if (skuConflict[0]) {
      throw new CatalogDomainError(
        `El SKU "${trimmedSku}" ya está registrado en el sistema.`,
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
        ${trimmedSku},
        ${trimmedTitle},
        ${input.priceCents},
        ${input.compareAtPriceCents ?? null},
        ${input.costCents ?? null},
        ${input.weightGrams ?? null},
        ${JSON.stringify(input.attributes ?? {})}::jsonb,
        ${input.status ?? "ACTIVE"},
        ${input.displayOrder ?? 0},
        NOW(),
        NOW()
      )
      RETURNING *;
    `)) as unknown as Record<string, unknown>[];

    if (!rawCreated) {
      throw new CatalogDomainError("No se pudo crear la variante.", "CREATE_FAILED", 500);
    }

    const createdVariant = mapVariantRow(rawCreated);

    // Insert AuditEvent
    const auditMetadata: Record<string, unknown> = {
      product_id: input.productId,
      sku: trimmedSku,
      title: trimmedTitle,
      price_cents: input.priceCents,
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
        ${input.mutationRequestId ?? null}
      );
    `);

    return createdVariant;
  });
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

  return await db.transaction(async (tx): Promise<ProductVariant> => {
    // 1. Load current variant under lock
    const currentRows = (await tx.execute(sql`
      SELECT * FROM product_variants WHERE id = ${input.variantId}::uuid FOR UPDATE LIMIT 1;
    `)) as unknown as Record<string, unknown>[];

    if (!currentRows[0]) {
      throw new CatalogDomainError("La variante no existe.", "VARIANT_NOT_FOUND", 404);
    }

    const current = mapVariantRow(currentRows[0]);

    // 2. Optimistic Concurrency Check
    const expectedTime = new Date(input.expectedUpdatedAt).getTime();
    const actualTime = new Date(current.updatedAt).getTime();
    if (Math.abs(expectedTime - actualTime) > 1000) {
      throw new StaleWriteConflictError();
    }

    // 3. SKU Immutability Rule Enforcement
    let targetSku = current.sku;
    if (input.sku !== undefined) {
      const trimmedSku = input.sku.trim();
      if (!trimmedSku || trimmedSku.length > 50) {
        throw new CatalogDomainError(
          "El SKU no puede estar vacío ni exceder 50 caracteres.",
          "INVALID_SKU"
        );
      }

      if (trimmedSku !== current.sku) {
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
          SELECT id FROM product_variants WHERE sku = ${trimmedSku} AND id <> ${current.id} LIMIT 1;
        `)) as unknown as { id: string }[];

        if (conflictRows[0]) {
          throw new CatalogDomainError(
            `El SKU "${trimmedSku}" ya está registrado en el sistema.`,
            "SKU_CONFLICT",
            409
          );
        }

        targetSku = trimmedSku;
      }
    }

    let targetTitle = current.title;
    if (input.title !== undefined) {
      const trimmedTitle = input.title.trim();
      if (!trimmedTitle || trimmedTitle.length > 150) {
        throw new CatalogDomainError(
          "El título de la variante no puede estar vacío ni exceder 150 caracteres.",
          "INVALID_VARIANT_TITLE"
        );
      }
      targetTitle = trimmedTitle;
    }

    const targetPriceCents = input.priceCents ?? current.priceCents;
    if (targetPriceCents <= 0) {
      throw new CatalogDomainError("El precio de venta debe ser mayor a 0.", "INVALID_PRICE");
    }

    const targetCompareAt =
      input.compareAtPriceCents !== undefined
        ? input.compareAtPriceCents
        : current.compareAtPriceCents;
    const targetCost = input.costCents !== undefined ? input.costCents : current.costCents;
    const targetWeight = input.weightGrams !== undefined ? input.weightGrams : current.weightGrams;
    const targetAttributes = input.attributes ?? current.attributes;
    const targetStatus = input.status ?? current.status;
    const targetDisplayOrder = input.displayOrder ?? current.displayOrder;

    const [rawUpdated] = (await tx.execute(sql`
      UPDATE product_variants SET
        sku = ${targetSku},
        title = ${targetTitle},
        price_cents = ${targetPriceCents},
        compare_at_price_cents = ${targetCompareAt},
        cost_cents = ${targetCost},
        weight_grams = ${targetWeight},
        attributes = ${JSON.stringify(targetAttributes)}::jsonb,
        status = ${targetStatus},
        display_order = ${targetDisplayOrder},
        updated_at = NOW()
      WHERE id = ${current.id}::uuid
      RETURNING *;
    `)) as unknown as Record<string, unknown>[];

    if (!rawUpdated) {
      throw new CatalogDomainError("No se pudo actualizar la variante.", "UPDATE_FAILED", 500);
    }

    const updatedVariant = mapVariantRow(rawUpdated);

    // Insert AuditEvent
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
          after: { sku: targetSku, title: targetTitle, price_cents: targetPriceCents },
        })}::jsonb,
        ${input.mutationRequestId ?? null}
      );
    `);

    return updatedVariant;
  });
}

/**
 * Transitions Product Status (DRAFT, PUBLISHED, ARCHIVED).
 * Enforces canonical RBAC permissions (catalog:publish required for publish/unpublish)
 * and fail-closed Publish Readiness validation.
 */
export async function transitionProductStatus(
  input: StatusTransitionInput,
  options?: ServiceOptions
): Promise<Product> {
  const isPublishing = input.targetStatus === "PUBLISHED";

  // First fetch current status to check required permission
  const currentStatusRows = (await db.execute(sql`
    SELECT status, updated_at FROM products WHERE id = ${input.productId}::uuid LIMIT 1;
  `)) as unknown as { status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; updated_at: string | Date }[];

  if (!currentStatusRows[0]) {
    throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
  }

  const currentStatus = currentStatusRows[0].status;

  // Target-state idempotency check before auth resolution:
  if (currentStatus === input.targetStatus) {
    await resolveActorAndAssertPermission("catalog:manage", options);
    const [p] = (await db.execute(
      sql`SELECT * FROM products WHERE id = ${input.productId}::uuid LIMIT 1;`
    )) as unknown as Product[];
    if (!p) {
      throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
    }
    return p;
  }

  const requiresPublishPerm = isPublishing || currentStatus === "PUBLISHED";
  const requiredPerm = requiresPublishPerm ? "catalog:publish" : "catalog:manage";

  const { authUserId } = await resolveActorAndAssertPermission(requiredPerm, options);

  // Idempotency Digests
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

  return await db.transaction(async (tx): Promise<Product> => {
    // Replay lookup under lock
    if (lockKey !== null && mutationRequestDigest) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

      const existingAuditRows = (await tx.execute(sql`
        SELECT * FROM audit_events
        WHERE actor_id = ${authUserId}
          AND action LIKE 'catalog:product:%'
          AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
        ORDER BY timestamp DESC
        LIMIT 1;
      `)) as unknown as { target_id: string; metadata: { request_fingerprint?: string } }[];

      if (existingAuditRows[0]) {
        const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
        if (storedFingerprint !== requestFingerprint) {
          throw new CatalogIdempotencyConflictError();
        }

        const [targetProdRow] = (await tx.execute(sql`
          SELECT * FROM products WHERE id = ${input.productId}::uuid LIMIT 1;
        `)) as unknown as Record<string, unknown>[];

        if (!targetProdRow) {
          throw new CatalogReplayIntegrityError();
        }

        return mapProductRow(targetProdRow);
      }
    }

    // 1. Load product under lock
    const [rawProduct] = (await tx.execute(sql`
      SELECT * FROM products WHERE id = ${input.productId}::uuid FOR UPDATE LIMIT 1;
    `)) as unknown as Record<string, unknown>[];

    if (!rawProduct) {
      throw new CatalogDomainError("El producto no existe.", "PRODUCT_NOT_FOUND", 404);
    }
    const product = mapProductRow(rawProduct);

    // 2. Optimistic concurrency check
    const expectedTime = new Date(input.expectedUpdatedAt).getTime();
    const actualTime = new Date(product.updatedAt).getTime();
    if (Math.abs(expectedTime - actualTime) > 1000) {
      throw new StaleWriteConflictError();
    }

    // 3. Target-state idempotency inside transaction
    if (product.status === input.targetStatus) {
      return product;
    }

    // 4. If transitioning to PUBLISHED, execute Publish Readiness Validator
    if (isPublishing) {
      const detail = await getAdminProductDetail(product.id, {
        authContext: options?.authContext ?? {
          status: "READY",
          authUserId,
          email: null,
          roles: ["ADMIN_CATALOG"],
          permissions: new Set(["catalog:manage", "catalog:publish"]),
        },
      });

      if (!detail || !detail.publishReadiness.isPublishable) {
        const firstBlocker = detail?.publishReadiness.blockers[0];
        throw new CatalogDomainError(
          firstBlocker?.message ?? "El producto no cumple con los requisitos de publicación.",
          firstBlocker?.code ?? "PUBLISH_READINESS_FAILED",
          422
        );
      }
    }

    // 5. Update Status
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

    // 6. Action string mapping
    let actionString = "catalog:product:update_status";
    if (isPublishing) actionString = "catalog:product:publish";
    else if (currentStatus === "PUBLISHED" && input.targetStatus === "DRAFT")
      actionString = "catalog:product:unpublish";
    else if (input.targetStatus === "ARCHIVED") actionString = "catalog:product:archive";
    else if (currentStatus === "ARCHIVED" && input.targetStatus === "DRAFT")
      actionString = "catalog:product:restore";

    const auditMetadata: Record<string, unknown> = {
      from_status: currentStatus,
      to_status: input.targetStatus,
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
        ${actionString},
        'product',
        ${product.id},
        ${JSON.stringify(auditMetadata)}::jsonb,
        ${input.mutationRequestId ?? null}
      );
    `);

    return updatedProduct;
  });
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

  // Idempotency Digests
  let mutationRequestDigest: string | null = null;
  let requestFingerprint: string | null = null;

  if (input.mutationRequestId) {
    mutationRequestDigest = computeMutationRequestDigest(
      authUserId,
      "catalog:product:duplicate",
      input.mutationRequestId
    );
    requestFingerprint = computeRequestFingerprint({
      sourceProductId: input.sourceProductId,
      options: input.options ?? {},
    });
  }

  const lockKey = mutationRequestDigest
    ? createCatalogAdvisoryLockKey(mutationRequestDigest)
    : null;

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
      `)) as unknown as { target_id: string; metadata: { request_fingerprint?: string } }[];

      if (existingAuditRows[0]) {
        const storedFingerprint = existingAuditRows[0].metadata?.request_fingerprint;
        if (storedFingerprint !== requestFingerprint) {
          throw new CatalogIdempotencyConflictError();
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
    const duplicateName = input.options?.customName?.trim() ?? `${source.name} (Copia)`;
    let baseDuplicateSlug =
      input.options?.customSlug?.trim().toLowerCase() ?? `${source.slug}-copia`;
    if (!PRODUCT_SLUG_REGEX.test(baseDuplicateSlug)) {
      baseDuplicateSlug = `${source.slug}-copia`;
    }

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
      slugSuffix++;
      duplicateSlug = `${baseDuplicateSlug}-${slugSuffix}`;
    }

    const newProductId = generateUuidV7();

    // 3. Create duplicate Product in DRAFT status, isFeatured = false
    const [clonedRow] = (await tx.execute(sql`
      INSERT INTO products (
        id, brand_id, category_id, name, slug, subtitle, description, status, is_featured, primary_media_id, created_at, updated_at
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
        NULL,
        NOW(),
        NOW()
      )
      RETURNING *;
    `)) as unknown as Record<string, unknown>[];

    if (!clonedRow) {
      throw new CatalogDomainError("No se pudo duplicar el producto.", "DUPLICATE_FAILED", 500);
    }

    const duplicatedProduct = mapProductRow(clonedRow);

    // 4. Duplicate Variants and build sourceVariantId -> newVariantId map
    const rawSourceVariants = (await tx.execute(sql`
      SELECT * FROM product_variants WHERE product_id = ${source.id}::uuid ORDER BY display_order ASC;
    `)) as unknown as Record<string, unknown>[];

    const sourceVariants = rawSourceVariants.map(mapVariantRow);

    const variantIdMap = new Map<string, string>();

    for (const sv of sourceVariants) {
      const newVarId = generateUuidV7();
      variantIdMap.set(sv.id, newVarId);

      // Derive unique duplicate SKU
      let duplicateSku = `${sv.sku}-COPY`;
      let skuSuffix = 1;
      while (true) {
        const skuConflict = (await tx.execute(sql`
          SELECT id FROM product_variants WHERE sku = ${duplicateSku} LIMIT 1;
        `)) as unknown as { id: string }[];
        if (!skuConflict[0]) {
          break;
        }
        skuSuffix++;
        duplicateSku = `${sv.sku}-COPY-${skuSuffix}`;
      }

      await tx.execute(sql`
        INSERT INTO product_variants (
          id, product_id, sku, title, price_cents, compare_at_price_cents, cost_cents,
          weight_grams, attributes, status, display_order, created_at, updated_at
        ) VALUES (
          ${newVarId}::uuid,
          ${newProductId}::uuid,
          ${duplicateSku},
          ${sv.title},
          ${sv.priceCents},
          ${sv.compareAtPriceCents},
          ${sv.costCents},
          ${sv.weightGrams},
          ${JSON.stringify(sv.attributes ?? {})}::jsonb,
          ${sv.status},
          ${sv.displayOrder},
          NOW(),
          NOW()
        );
      `);
    }

    // 5. Duplicate Product Specifications
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

    // 7. Insert AuditEvent
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
        ${input.mutationRequestId ?? null}
      );
    `);

    return duplicatedProduct;
  });
}
