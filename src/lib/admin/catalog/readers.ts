import "server-only";

import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import type {
  AdminProductDetail,
  AdminProductDetailMedia,
  AdminProductDetailVariant,
  AdminProductListItem,
  AdminProductListQuery,
  AdminProductListResult,
  BrandReference,
  CategoryReference,
} from "./types";
import { CatalogDomainError } from "./types";
import { evaluatePublishReadiness } from "./publish-readiness";
import { resolveAuthoritativeCategorySpecificationSchema } from "./specifications";
import type { CategorySpecificationSchema, MediaAsset } from "@/db/schema";

export interface ReaderOptions {
  authContext?: VerifiedAuthContextReady;
}

/**
 * Admin Product List Reader.
 * Implements the canonical query from the frozen contract with CTE pre-aggregation
 * to eliminate Cartesian fan-out across multiple inventory locations.
 */
export async function getAdminProductList(
  query: AdminProductListQuery = {},
  options?: ReaderOptions
): Promise<AdminProductListResult> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos para ver el catálogo administrativo.",
        "FORBIDDEN",
        403
      );
    }
  } else {
    await requirePermission("catalog:manage");
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const statusFilter = query.status ? sql`p.status = ${query.status}::catalog_status` : sql`TRUE`;
  const brandFilter = query.brandId ? sql`p.brand_id = ${query.brandId}::uuid` : sql`TRUE`;
  const categoryFilter = query.categoryId
    ? sql`p.category_id = ${query.categoryId}::uuid`
    : sql`TRUE`;

  // Readiness gaps mirror the publish blockers so the list can answer "what is missing".
  let pendingFilter = sql`TRUE`;
  if (query.pending === "media") {
    pendingFilter = sql`p.primary_media_id IS NULL`;
  } else if (query.pending === "variants") {
    pendingFilter = sql`NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.status = 'ACTIVE')`;
  } else if (query.pending === "price") {
    pendingFilter = sql`NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.status = 'ACTIVE' AND pv.price_cents > 0)`;
  } else if (query.pending === "stock") {
    pendingFilter = sql`COALESCE((
      SELECT SUM(ii.quantity_on_hand - ii.quantity_reserved - ii.quantity_allocated)
      FROM product_variants pv
      INNER JOIN inventory_items ii ON ii.variant_id = pv.id
      WHERE pv.product_id = p.id AND pv.status = 'ACTIVE'
    ), 0) <= 0`;
  }

  const idFilter = query.productIds
    ? query.productIds.length > 0
      ? sql`p.id IN (${sql.join(
          query.productIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
      : sql`FALSE`
    : sql`TRUE`;

  let searchFilter = sql`TRUE`;
  if (query.search && query.search.trim()) {
    const term = `%${query.search.trim()}%`;
    searchFilter = sql`(p.name ILIKE ${term} OR p.slug ILIKE ${term})`;
  }

  // Execute Count Query
  const countQuery = sql`
    SELECT COUNT(p.id)::int AS total
    FROM products p
    WHERE ${statusFilter}
      AND ${brandFilter}
      AND ${categoryFilter}
      AND ${pendingFilter}
      AND ${idFilter}
      AND ${searchFilter};
  `;

  const countResult = (await db.execute(countQuery)) as unknown as { total: number }[];
  const total = countResult[0]?.total ?? 0;

  // Execute Canonical Admin List Query with CTE pre-aggregation
  const listQuery = sql`
    WITH variant_summary AS (
      SELECT
        pv.product_id,
        COUNT(pv.id)::int AS total_variants,
        COUNT(CASE WHEN pv.status = 'ACTIVE' THEN 1 END)::int AS active_variants,
        MIN(CASE WHEN pv.status = 'ACTIVE' THEN pv.price_cents END)::int AS min_active_price_cents,
        MAX(CASE WHEN pv.status = 'ACTIVE' THEN pv.price_cents END)::int AS max_active_price_cents
      FROM product_variants pv
      GROUP BY pv.product_id
    ),
    active_inventory_summary AS (
      SELECT
        pv.product_id,
        COALESCE(SUM(ii.quantity_on_hand - ii.quantity_reserved - ii.quantity_allocated), 0)::int AS active_variant_ats
      FROM product_variants pv
      INNER JOIN inventory_items ii ON pv.id = ii.variant_id
      WHERE pv.status = 'ACTIVE'
      GROUP BY pv.product_id
    )
    SELECT
      p.id,
      p.name,
      p.slug,
      p.status,
      p.is_featured,
      p.created_at,
      p.updated_at,
      b.id AS brand_id,
      b.name AS brand_name,
      c.id AS category_id,
      c.name AS category_name,
      ma.object_key AS primary_media_key,
      ma.alt_text AS primary_media_alt,
      COALESCE(vs.total_variants, 0)::int AS total_variants,
      COALESCE(vs.active_variants, 0)::int AS active_variants,
      vs.min_active_price_cents,
      vs.max_active_price_cents,
      COALESCE(ais.active_variant_ats, 0)::int AS active_variant_ats
    FROM products p
    INNER JOIN brands b ON p.brand_id = b.id
    INNER JOIN categories c ON p.category_id = c.id
    LEFT JOIN media_assets ma ON p.primary_media_id = ma.id
    LEFT JOIN variant_summary vs ON p.id = vs.product_id
    LEFT JOIN active_inventory_summary ais ON p.id = ais.product_id
    WHERE ${statusFilter}
      AND ${brandFilter}
      AND ${categoryFilter}
      AND ${pendingFilter}
      AND ${idFilter}
      AND ${searchFilter}
    ORDER BY p.updated_at DESC, p.id DESC
    LIMIT ${pageSize} OFFSET ${offset};
  `;

  interface RawListItem {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    is_featured: boolean;
    created_at: string | Date;
    updated_at: string | Date;
    brand_id: string;
    brand_name: string;
    category_id: string;
    category_name: string;
    primary_media_key: string | null;
    primary_media_alt: string | null;
    total_variants: number;
    active_variants: number;
    min_active_price_cents: number | null;
    max_active_price_cents: number | null;
    active_variant_ats: number;
  }

  const rows = (await db.execute(listQuery)) as unknown as RawListItem[];

  const items: AdminProductListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    isFeatured: Boolean(r.is_featured),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    brandId: r.brand_id,
    brandName: r.brand_name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    primaryMediaKey: r.primary_media_key,
    primaryMediaAlt: r.primary_media_alt,
    totalVariants: Number(r.total_variants ?? 0),
    activeVariants: Number(r.active_variants ?? 0),
    minActivePriceCents:
      r.min_active_price_cents !== null ? Number(r.min_active_price_cents) : null,
    maxActivePriceCents:
      r.max_active_price_cents !== null ? Number(r.max_active_price_cents) : null,
    activeVariantAts: Number(r.active_variant_ats ?? 0),
  }));

  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Internal transaction-aware catalog aggregate loader.
 * Used after status transition authorization has already verified the actor.
 * Performs ZERO public-reader RBAC decisions and executes against the provided transaction/executor.
 */
export async function loadInternalProductDetail(
  productId: string,
  executor: { execute: (query: SQLWrapper) => Promise<unknown> } = db
): Promise<AdminProductDetail | null> {
  // 1. Load Product
  const productRows = (await executor.execute(sql`
    SELECT * FROM products WHERE id = ${productId}::uuid LIMIT 1;
  `)) as Record<string, unknown>[];

  if (!productRows[0]) {
    return null;
  }

  const rawProd = productRows[0];
  const product = {
    id: String(rawProd.id),
    brandId: String(rawProd.brand_id),
    categoryId: String(rawProd.category_id),
    name: String(rawProd.name),
    slug: String(rawProd.slug),
    subtitle: rawProd.subtitle ? String(rawProd.subtitle) : null,
    description: rawProd.description ? String(rawProd.description) : null,
    pdpConfig: (rawProd.pdp_config ?? {}) as Record<string, unknown>,
    status: rawProd.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    isFeatured: Boolean(rawProd.is_featured),
    primaryMediaId: rawProd.primary_media_id ? String(rawProd.primary_media_id) : null,
    createdAt: new Date(String(rawProd.created_at)),
    updatedAt: new Date(String(rawProd.updated_at)),
  };

  // 2. Load Brand
  const brandRows = (await executor.execute(sql`
    SELECT * FROM brands WHERE id = ${product.brandId}::uuid LIMIT 1;
  `)) as Record<string, unknown>[];

  if (!brandRows[0]) {
    throw new Error(`Integridad rota: marca ${product.brandId} no encontrada.`);
  }

  const rawBrand = brandRows[0];
  const brand = {
    id: String(rawBrand.id),
    name: String(rawBrand.name),
    slug: String(rawBrand.slug),
    description: rawBrand.description ? String(rawBrand.description) : null,
    websiteUrl: rawBrand.website_url ? String(rawBrand.website_url) : null,
    logoMediaId: rawBrand.logo_media_id ? String(rawBrand.logo_media_id) : null,
    status: rawBrand.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    createdAt: new Date(String(rawBrand.created_at)),
    updatedAt: new Date(String(rawBrand.updated_at)),
  };

  // 3. Load Category
  const categoryRows = (await executor.execute(sql`
    SELECT * FROM categories WHERE id = ${product.categoryId}::uuid LIMIT 1;
  `)) as Record<string, unknown>[];

  if (!categoryRows[0]) {
    throw new Error(`Integridad rota: categoría ${product.categoryId} no encontrada.`);
  }

  const rawCat = categoryRows[0];
  const category = {
    id: String(rawCat.id),
    name: String(rawCat.name),
    slug: String(rawCat.slug),
    parentId: rawCat.parent_id ? String(rawCat.parent_id) : null,
    currentSpecSchemaId: rawCat.current_spec_schema_id
      ? String(rawCat.current_spec_schema_id)
      : null,
    description: rawCat.description ? String(rawCat.description) : null,
    displayOrder: Number(rawCat.display_order ?? 0),
    status: rawCat.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    createdAt: new Date(String(rawCat.created_at)),
    updatedAt: new Date(String(rawCat.updated_at)),
  };

  // 4. Load Category Specification Schema using strict authoritative resolver
  const { schema: currentSpecSchema } = await resolveAuthoritativeCategorySpecificationSchema(
    product.categoryId,
    executor
  );

  // 5. Load Product Specifications
  const specRows = (await executor.execute(sql`
    SELECT * FROM product_specifications WHERE product_id = ${productId}::uuid LIMIT 1;
  `)) as Record<string, unknown>[];

  const specifications = specRows[0]
    ? {
        productId: String(specRows[0].product_id),
        schemaId: String(specRows[0].schema_id),
        schemaVersion: Number(specRows[0].schema_version),
        specValues: (specRows[0].spec_values ?? {}) as Record<
          string,
          string | number | boolean | null
        >,
        updatedAt: new Date(String(specRows[0].updated_at)),
      }
    : null;

  // 6. Load Product Variants and determine SKU immutability
  const variantRows = (await executor.execute(sql`
    SELECT
      pv.*,
      (
        EXISTS(SELECT 1 FROM inventory_items ii WHERE ii.variant_id = pv.id)
        OR
        EXISTS(SELECT 1 FROM order_items oi WHERE oi.variant_id = pv.id)
      ) AS is_sku_immutable
    FROM product_variants pv
    WHERE pv.product_id = ${productId}::uuid
    ORDER BY pv.display_order ASC, pv.created_at ASC;
  `)) as Record<string, unknown>[];

  const variants: AdminProductDetailVariant[] = variantRows.map((v) => ({
    id: String(v.id),
    productId: String(v.product_id),
    sku: String(v.sku),
    title: String(v.title),
    priceCents: Number(v.price_cents),
    compareAtPriceCents:
      v.compare_at_price_cents !== null ? Number(v.compare_at_price_cents) : null,
    costCents: v.cost_cents !== null ? Number(v.cost_cents) : null,
    weightGrams: v.weight_grams !== null ? Number(v.weight_grams) : null,
    attributes: (v.attributes ?? {}) as Record<string, string>,
    status: v.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
    displayOrder: Number(v.display_order ?? 0),
    createdAt: new Date(String(v.created_at)),
    updatedAt: new Date(String(v.updated_at)),
    isSkuImmutable: Boolean(v.is_sku_immutable),
  }));

  // 7. Load Product Media gallery
  const mediaRows = (await executor.execute(sql`
    SELECT
      pm.id AS pm_id,
      pm.product_id,
      pm.media_asset_id,
      pm.variant_id,
      pm.display_order,
      pm.created_at AS pm_created_at,
      ma.object_key,
      ma.security_class,
      ma.media_type,
      ma.mime_type,
      ma.width,
      ma.height,
      ma.alt_text,
      ma.file_size_bytes,
      ma.checksum_sha256
    FROM product_media pm
    INNER JOIN media_assets ma ON pm.media_asset_id = ma.id
    WHERE pm.product_id = ${productId}::uuid
      AND pm.placement = 'GALLERY'
    ORDER BY pm.display_order ASC, pm.created_at ASC;
  `)) as Record<string, unknown>[];

  const media: AdminProductDetailMedia[] = mediaRows.map((m) => ({
    id: String(m.pm_id),
    productId: String(m.product_id),
    mediaAssetId: String(m.media_asset_id),
    variantId: m.variant_id ? String(m.variant_id) : null,
    displayOrder: Number(m.display_order ?? 0),
    createdAt: new Date(String(m.pm_created_at)),
    mediaAsset: {
      objectKey: String(m.object_key),
      securityClass: String(m.security_class),
      mediaType: String(m.media_type),
      mimeType: String(m.mime_type),
      width: m.width !== null ? Number(m.width) : null,
      height: m.height !== null ? Number(m.height) : null,
      altText: m.alt_text ? String(m.alt_text) : null,
    },
  }));

  // 8. Primary Media Asset
  let primaryMedia: AdminProductDetailMedia["mediaAsset"] | null = null;
  if (product.primaryMediaId) {
    const primaryAssetRows = (await executor.execute(sql`
      SELECT * FROM media_assets WHERE id = ${product.primaryMediaId}::uuid LIMIT 1;
    `)) as Record<string, unknown>[];

    if (primaryAssetRows[0]) {
      const pa = primaryAssetRows[0];
      primaryMedia = {
        objectKey: String(pa.object_key),
        securityClass: String(pa.security_class),
        mediaType: String(pa.media_type),
        mimeType: String(pa.mime_type),
        width: pa.width !== null ? Number(pa.width) : null,
        height: pa.height !== null ? Number(pa.height) : null,
        altText: pa.alt_text ? String(pa.alt_text) : null,
      };
    }
  }

  // 9. Publish Readiness evaluation
  const mediaForEvaluation = media.map((m) => ({
    id: m.id,
    productId: m.productId,
    mediaAssetId: m.mediaAssetId,
    variantId: m.variantId,
    displayOrder: m.displayOrder,
    // The list above is read with placement = 'GALLERY'.
    placement: "GALLERY" as const,
    createdAt: m.createdAt,
    mediaAsset: {
      id: m.mediaAssetId,
      objectKey: m.mediaAsset.objectKey,
      securityClass: m.mediaAsset.securityClass as MediaAsset["securityClass"],
      mediaType: m.mediaAsset.mediaType as MediaAsset["mediaType"],
      mimeType: m.mediaAsset.mimeType,
      fileSizeBytes: 0,
      width: m.mediaAsset.width,
      height: m.mediaAsset.height,
      altText: m.mediaAsset.altText,
      checksumSha256: "",
      createdAt: m.createdAt,
    },
  }));

  const primaryMediaAssetForEvaluation: MediaAsset | null =
    product.primaryMediaId && primaryMedia
      ? {
          id: product.primaryMediaId,
          objectKey: primaryMedia.objectKey,
          securityClass: primaryMedia.securityClass as MediaAsset["securityClass"],
          mediaType: primaryMedia.mediaType as MediaAsset["mediaType"],
          mimeType: primaryMedia.mimeType,
          fileSizeBytes: 0,
          width: primaryMedia.width,
          height: primaryMedia.height,
          altText: primaryMedia.altText,
          checksumSha256: null,
          createdAt: product.createdAt,
        }
      : null;

  const publishReadiness = evaluatePublishReadiness({
    product,
    brand,
    category,
    currentSpecSchema,
    specifications,
    variants,
    media: mediaForEvaluation,
    primaryMediaAsset: primaryMediaAssetForEvaluation,
  });

  return {
    product,
    brand,
    category,
    currentSpecSchema,
    specifications,
    variants,
    media,
    primaryMedia: primaryMediaAssetForEvaluation,
    publishReadiness,
  };
}

/**
 * Admin Product Detail Reader.
 * Authoritative reader for single product details, variants, media, specifications,
 * and pre-computed publish readiness for the Admin Product Manager.
 * Strictly requires catalog:manage permission.
 */
export async function getAdminProductDetail(
  productId: string,
  options?: ReaderOptions
): Promise<AdminProductDetail | null> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos para ver el catálogo administrativo.",
        "FORBIDDEN",
        403
      );
    }
  } else {
    await requirePermission("catalog:manage");
  }

  return await loadInternalProductDetail(productId, db);
}

/**
 * Reference Selector: Read-only selector for published brands.
 */
export async function getPublishedBrands(options?: ReaderOptions): Promise<BrandReference[]> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError("No tienes permisos para consultar marcas.", "FORBIDDEN", 403);
    }
  } else {
    await requirePermission("catalog:manage");
  }

  const rows = (await db.execute(sql`
    SELECT id, name, slug, status
    FROM brands
    WHERE status = 'PUBLISHED'
    ORDER BY name ASC;
  `)) as unknown as {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  }[];

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    status: r.status,
  }));
}

/**
 * Reference Selector: Read-only selector for published categories.
 */
export async function getPublishedCategories(
  options?: ReaderOptions
): Promise<CategoryReference[]> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos para consultar categorías.",
        "FORBIDDEN",
        403
      );
    }
  } else {
    await requirePermission("catalog:manage");
  }

  const rows = (await db.execute(sql`
    SELECT id, name, slug, status, current_spec_schema_id
    FROM categories
    WHERE status = 'PUBLISHED'
    ORDER BY display_order ASC, name ASC;
  `)) as unknown as {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    current_spec_schema_id: string | null;
  }[];

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    status: r.status,
    currentSpecSchemaId: r.current_spec_schema_id ? String(r.current_spec_schema_id) : null,
  }));
}

/**
 * Resolves the active specification schema for a Category using Category.current_spec_schema_id.
 */
export async function getCategorySpecificationSchema(
  categoryId: string,
  options?: ReaderOptions
): Promise<CategorySpecificationSchema | null> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos para consultar esquemas de especificaciones.",
        "FORBIDDEN",
        403
      );
    }
  } else {
    await requirePermission("catalog:manage");
  }

  const result = await resolveAuthoritativeCategorySpecificationSchema(categoryId, db);
  return result.schema;
}
