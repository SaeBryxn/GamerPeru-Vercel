import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { CatalogDomainError } from "./types";
import { convertPersistedStoryToAuthoring } from "./story-references";
import { StoryLifecycleIntegrityError } from "./story-service";
import { validatePersistedStoryDocument, type AuthoringStoryDocument } from "./story-validation";

export interface StoryReaderOptions {
  authContext?: VerifiedAuthContextReady;
}

export interface AdminStoryRevisionMetadata {
  id: string;
  revisionNumber: number;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminStorySelectableMedia {
  productMediaId: string;
  mediaAssetId: string;
  variantId: string | null;
  variantTitle: string | null;
  displayOrder: number;
  mediaType: "IMAGE" | "VIDEO";
  mimeType: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface AdminStoryRelatedProductOption {
  productId: string;
  name: string;
  slug: string;
  status: string;
  isPublicEligible: boolean;
}

export interface AdminProductStoryDto {
  product: {
    id: string;
    name: string;
    slug: string;
  };
  lifecycle: "NO_STORY" | "DRAFT_ONLY" | "PUBLISHED_ONLY" | "DRAFT_OVER_PUBLISHED";
  draft: AdminStoryRevisionMetadata | null;
  published: AdminStoryRevisionMetadata | null;
  savedDraftDocument: AuthoringStoryDocument | null;
  initialDocument: AuthoringStoryDocument;
  initialDocumentSource: "DRAFT" | "PUBLISHED" | "EMPTY";
  selectableMedia: AdminStorySelectableMedia[];
  initialRelatedProducts: AdminStoryRelatedProductOption[];
  concurrency: {
    expectedDraftRevisionId: string | null;
    expectedPublishedRevisionId: string | null;
  };
}

interface StoryRevisionReadRow {
  id: string;
  product_id: string;
  revision_number: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  blocks: unknown;
  published_at: Date | string | null;
  created_at: Date | string;
}

interface StoryMediaReadRow {
  product_media_id: string;
  media_asset_id: string;
  variant_id: string | null;
  variant_product_id: string | null;
  variant_title: string | null;
  display_order: number;
  object_key: string;
  security_class: string;
  media_type: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
}

async function assertManagePermission(options?: StoryReaderOptions): Promise<void> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError("No tienes permisos para leer esta historia.", "FORBIDDEN", 403);
    }
    return;
  }
  await requirePermission("catalog:manage");
}

function revisionMetadata(row: StoryRevisionReadRow): AdminStoryRevisionMetadata {
  return {
    id: row.id,
    revisionNumber: Number(row.revision_number),
    status: row.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getAdminProductStory(
  productId: string,
  options?: StoryReaderOptions
): Promise<AdminProductStoryDto> {
  await assertManagePermission(options);
  if (!z.string().uuid().safeParse(productId).success) {
    throw new CatalogDomainError(
      "La identidad del producto no tiene una estructura válida.",
      "STORY_INVALID_REQUEST",
      422
    );
  }

  const productRows = (await db.execute(sql`
    SELECT id, name, slug
    FROM products
    WHERE id = ${productId}::uuid
    LIMIT 1;
  `)) as unknown as { id: string; name: string; slug: string }[];
  const product = productRows[0];
  if (!product) {
    throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
  }

  const aggregateRows = (await db.execute(sql`
    SELECT product_id, draft_revision_id, published_revision_id
    FROM product_stories
    WHERE product_id = ${productId}::uuid
    LIMIT 1;
  `)) as unknown as {
    product_id: string;
    draft_revision_id: string | null;
    published_revision_id: string | null;
  }[];
  const aggregate = aggregateRows[0] ?? null;

  const revisionIds = aggregate
    ? [aggregate.draft_revision_id, aggregate.published_revision_id].filter(
        (value): value is string => value !== null
      )
    : [];
  let revisionById = new Map<string, StoryRevisionReadRow>();
  if (revisionIds.length > 0) {
    const revisionRows = (await db.execute(sql`
      SELECT id, product_id, revision_number, status, blocks, published_at, created_at
      FROM product_story_revisions
      WHERE id IN (${sql.join(
        revisionIds.map((revisionId) => sql`${revisionId}::uuid`),
        sql`, `
      )})
      ORDER BY id;
    `)) as unknown as StoryRevisionReadRow[];
    revisionById = new Map(revisionRows.map((row) => [row.id, row]));
  }

  const draftRow =
    aggregate?.draft_revision_id === null || aggregate?.draft_revision_id === undefined
      ? null
      : (revisionById.get(aggregate.draft_revision_id) ?? null);
  const publishedRow =
    aggregate?.published_revision_id === null || aggregate?.published_revision_id === undefined
      ? null
      : (revisionById.get(aggregate.published_revision_id) ?? null);
  if (
    (aggregate?.draft_revision_id !== null &&
      aggregate?.draft_revision_id !== undefined &&
      (!draftRow || draftRow.product_id !== productId || draftRow.status !== "DRAFT")) ||
    (aggregate?.published_revision_id !== null &&
      aggregate?.published_revision_id !== undefined &&
      (!publishedRow ||
        publishedRow.product_id !== productId ||
        publishedRow.status !== "PUBLISHED" ||
        publishedRow.published_at === null)) ||
    (aggregate?.draft_revision_id !== null &&
      aggregate?.draft_revision_id !== undefined &&
      aggregate.draft_revision_id === aggregate.published_revision_id)
  ) {
    throw new StoryLifecycleIntegrityError();
  }

  let savedDraftDocument: AuthoringStoryDocument | null = null;
  let initialDocument: AuthoringStoryDocument = [];
  let initialDocumentSource: AdminProductStoryDto["initialDocumentSource"] = "EMPTY";

  if (draftRow) {
    const persisted = validatePersistedStoryDocument(draftRow.blocks, { allowEmpty: true });
    savedDraftDocument = await convertPersistedStoryToAuthoring(db, productId, persisted);
    initialDocument = savedDraftDocument;
    initialDocumentSource = "DRAFT";
  } else if (publishedRow) {
    const persisted = validatePersistedStoryDocument(publishedRow.blocks, { allowEmpty: false });
    initialDocument = await convertPersistedStoryToAuthoring(db, productId, persisted);
    initialDocumentSource = "PUBLISHED";
  }

  const mediaRows = (await db.execute(sql`
    SELECT
      product_media.id AS product_media_id,
      product_media.media_asset_id,
      product_media.variant_id,
      product_variants.product_id AS variant_product_id,
      product_variants.title AS variant_title,
      product_media.display_order,
      media_assets.object_key,
      media_assets.security_class,
      media_assets.media_type,
      media_assets.mime_type,
      media_assets.width,
      media_assets.height,
      media_assets.alt_text
    FROM product_media
    INNER JOIN media_assets ON media_assets.id = product_media.media_asset_id
    LEFT JOIN product_variants ON product_variants.id = product_media.variant_id
    WHERE product_media.product_id = ${productId}::uuid
    ORDER BY product_media.display_order, product_media.created_at, product_media.id;
  `)) as unknown as StoryMediaReadRow[];

  const selectableMedia = mediaRows.flatMap((row): AdminStorySelectableMedia[] => {
    const publicUrl = resolvePublicMediaUrl(row.object_key);
    const validVariant = row.variant_id === null || row.variant_product_id === productId;
    const validType = row.media_type === "IMAGE" || row.media_type === "VIDEO";
    const validMime =
      (row.media_type === "IMAGE" &&
        ["image/webp", "image/png", "image/jpeg"].includes(row.mime_type)) ||
      (row.media_type === "VIDEO" && row.mime_type === "video/mp4");
    if (
      row.security_class !== "PUBLIC_MEDIA" ||
      !validVariant ||
      !validType ||
      !validMime ||
      publicUrl === null
    ) {
      return [];
    }
    return [
      {
        productMediaId: row.product_media_id,
        mediaAssetId: row.media_asset_id,
        variantId: row.variant_id,
        variantTitle: row.variant_title,
        displayOrder: Number(row.display_order),
        mediaType: row.media_type as "IMAGE" | "VIDEO",
        mimeType: row.mime_type,
        publicUrl,
        width: row.width,
        height: row.height,
        altText: row.alt_text,
      },
    ];
  });

  const initialRelatedIds = initialDocument.flatMap((block) =>
    block.type === "related_products" ? block.payload.productIds : []
  );
  const initialRelatedProducts = await loadRelatedProductOptionsByIds(initialRelatedIds);

  const lifecycle: AdminProductStoryDto["lifecycle"] = draftRow
    ? publishedRow
      ? "DRAFT_OVER_PUBLISHED"
      : "DRAFT_ONLY"
    : publishedRow
      ? "PUBLISHED_ONLY"
      : "NO_STORY";

  return {
    product,
    lifecycle,
    draft: draftRow ? revisionMetadata(draftRow) : null,
    published: publishedRow ? revisionMetadata(publishedRow) : null,
    savedDraftDocument,
    initialDocument,
    initialDocumentSource,
    selectableMedia,
    initialRelatedProducts,
    concurrency: {
      expectedDraftRevisionId: aggregate?.draft_revision_id ?? null,
      expectedPublishedRevisionId: aggregate?.published_revision_id ?? null,
    },
  };
}

interface RelatedProductMetadataRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand_status: string;
  category_status: string;
  has_active_variant: boolean;
}

function isPublicEligible(row: RelatedProductMetadataRow): boolean {
  return (
    row.status === "PUBLISHED" &&
    row.brand_status === "PUBLISHED" &&
    row.category_status === "PUBLISHED" &&
    row.has_active_variant
  );
}

async function loadRelatedProductOptionsByIds(
  ids: readonly string[]
): Promise<AdminStoryRelatedProductOption[]> {
  if (ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  const rows = (await db.execute(sql`
    SELECT
      products.id,
      products.name,
      products.slug,
      products.status,
      brands.status AS brand_status,
      categories.status AS category_status,
      EXISTS (
        SELECT 1 FROM product_variants
        WHERE product_variants.product_id = products.id
          AND product_variants.status = 'ACTIVE'
      ) AS has_active_variant
    FROM products
    INNER JOIN brands ON brands.id = products.brand_id
    INNER JOIN categories ON categories.id = products.category_id
    WHERE products.id IN (${sql.join(
      uniqueIds.map((id) => sql`${id}::uuid`),
      sql`, `
    )})
    ORDER BY products.name ASC;
  `)) as unknown as RelatedProductMetadataRow[];

  return rows.map((row) => ({
    productId: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    isPublicEligible: isPublicEligible(row),
  }));
}

export async function searchStoryRelatedProducts(
  currentProductId: string,
  query: string,
  options?: StoryReaderOptions
): Promise<AdminStoryRelatedProductOption[]> {
  await assertManagePermission(options);
  if (!z.string().uuid().safeParse(currentProductId).success) {
    throw new CatalogDomainError(
      "La identidad del producto no tiene una estructura válida.",
      "STORY_INVALID_REQUEST",
      422
    );
  }

  const sanitizedQuery = query.trim().slice(0, 100);
  const pattern = `%${sanitizedQuery}%`;

  const rows = (await db.execute(sql`
    SELECT
      products.id,
      products.name,
      products.slug,
      products.status,
      brands.status AS brand_status,
      categories.status AS category_status,
      EXISTS (
        SELECT 1 FROM product_variants
        WHERE product_variants.product_id = products.id
          AND product_variants.status = 'ACTIVE'
      ) AS has_active_variant
    FROM products
    INNER JOIN brands ON brands.id = products.brand_id
    INNER JOIN categories ON categories.id = products.category_id
    WHERE products.id != ${currentProductId}::uuid
      AND (products.name ILIKE ${pattern} OR products.slug ILIKE ${pattern})
    ORDER BY products.name ASC
    LIMIT 20;
  `)) as unknown as RelatedProductMetadataRow[];

  return rows.map((row) => ({
    productId: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    isPublicEligible: isPublicEligible(row),
  }));
}
