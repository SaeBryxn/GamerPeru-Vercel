import "server-only";

import { sql, type SQL } from "drizzle-orm";
import type { db } from "@/db";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import {
  StoryValidationError,
  type AuthoringStoryDocument,
  type StrictPersistedStoryDocument,
} from "./story-validation";

type StoryExecutor = Pick<typeof db, "execute">;
type MediaKind = "IMAGE" | "VIDEO";

interface MediaSelection {
  id: string;
  kind: MediaKind;
  path: string;
}

interface PersistedMediaReference {
  objectKey: string;
  kind: MediaKind;
  path: string;
}

interface MediaReferenceRow {
  product_media_id: string;
  product_id: string;
  variant_id: string | null;
  variant_product_id: string | null;
  object_key: string;
  security_class: string;
  media_type: string;
  mime_type: string;
}

interface RelatedProductRow {
  id: string;
  slug: string;
  status: string;
  brand_status: string;
  category_status: string;
  has_active_variant: boolean;
}

const IMAGE_MIME_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4"]);

function sqlUuidList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `
  );
}

function sqlTextList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
}

function referenceError(path: string, code: string, message: string): StoryValidationError {
  return new StoryValidationError([{ path, code, message }]);
}

function collectAuthoringMedia(document: AuthoringStoryDocument): MediaSelection[] {
  const selections: MediaSelection[] = [];
  const add = (id: string | undefined, kind: MediaKind, path: string) => {
    if (id !== undefined) {
      selections.push({ id, kind, path });
    }
  };

  document.forEach((block, blockIndex) => {
    const path = `blocks[${blockIndex}].payload`;
    switch (block.type) {
      case "hero_media":
        add(block.payload.mediaId, "IMAGE", `${path}.mediaId`);
        add(block.payload.posterMediaId, "IMAGE", `${path}.posterMediaId`);
        add(block.payload.videoMediaId, "VIDEO", `${path}.videoMediaId`);
        break;
      case "full_bleed_image":
      case "image_text":
        add(block.payload.mediaId, "IMAGE", `${path}.mediaId`);
        break;
      case "spec_feature":
        add(block.payload.mediaId, "IMAGE", `${path}.mediaId`);
        break;
      case "video":
        add(block.payload.videoMediaId, "VIDEO", `${path}.videoMediaId`);
        add(block.payload.posterMediaId, "IMAGE", `${path}.posterMediaId`);
        break;
      case "gallery":
        block.payload.items.forEach((item, itemIndex) => {
          add(item.mediaId, "IMAGE", `${path}.items[${itemIndex}].mediaId`);
        });
        break;
      case "dimensions":
        add(block.payload.blueprintMediaId, "IMAGE", `${path}.blueprintMediaId`);
        break;
      case "box_contents":
        block.payload.items.forEach((item, itemIndex) => {
          add(item.mediaId, "IMAGE", `${path}.items[${itemIndex}].mediaId`);
        });
        break;
      case "stat_highlight":
      case "comparison":
      case "technical_specs":
      case "faq":
      case "related_products":
        break;
    }
  });

  return selections;
}

function collectPersistedMedia(document: StrictPersistedStoryDocument): PersistedMediaReference[] {
  const references: PersistedMediaReference[] = [];
  const add = (objectKey: string | undefined, kind: MediaKind, path: string) => {
    if (objectKey !== undefined) {
      references.push({ objectKey, kind, path });
    }
  };

  document.forEach((block, blockIndex) => {
    const path = `blocks[${blockIndex}].payload`;
    switch (block.type) {
      case "hero_media":
        add(block.payload.mediaKey, "IMAGE", `${path}.mediaKey`);
        add(block.payload.posterKey, "IMAGE", `${path}.posterKey`);
        add(block.payload.videoKey, "VIDEO", `${path}.videoKey`);
        break;
      case "full_bleed_image":
      case "image_text":
        add(block.payload.mediaKey, "IMAGE", `${path}.mediaKey`);
        break;
      case "spec_feature":
        add(block.payload.mediaKey, "IMAGE", `${path}.mediaKey`);
        break;
      case "video":
        add(block.payload.videoKey, "VIDEO", `${path}.videoKey`);
        add(block.payload.posterKey, "IMAGE", `${path}.posterKey`);
        break;
      case "gallery":
        block.payload.items.forEach((item, itemIndex) => {
          add(item.mediaKey, "IMAGE", `${path}.items[${itemIndex}].mediaKey`);
        });
        break;
      case "dimensions":
        add(block.payload.blueprintMediaKey, "IMAGE", `${path}.blueprintMediaKey`);
        break;
      case "box_contents":
        block.payload.items.forEach((item, itemIndex) => {
          add(item.mediaKey, "IMAGE", `${path}.items[${itemIndex}].mediaKey`);
        });
        break;
      case "stat_highlight":
      case "comparison":
      case "technical_specs":
      case "faq":
      case "related_products":
        break;
    }
  });

  return references;
}

async function loadMediaByIds(
  executor: StoryExecutor,
  ids: readonly string[]
): Promise<Map<string, MediaReferenceRow>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = (await executor.execute(sql`
    SELECT
      product_media.id AS product_media_id,
      product_media.product_id,
      product_media.variant_id,
      product_variants.product_id AS variant_product_id,
      media_assets.object_key,
      media_assets.security_class,
      media_assets.media_type,
      media_assets.mime_type
    FROM product_media
    INNER JOIN media_assets ON media_assets.id = product_media.media_asset_id
    LEFT JOIN product_variants ON product_variants.id = product_media.variant_id
    WHERE product_media.id IN (${sqlUuidList(uniqueIds)})
    ORDER BY product_media.id
    FOR SHARE OF product_media, media_assets;
  `)) as unknown as MediaReferenceRow[];

  return new Map(rows.map((row) => [row.product_media_id, row]));
}

async function loadMediaByObjectKeys(
  executor: StoryExecutor,
  productId: string,
  objectKeys: readonly string[]
): Promise<Map<string, MediaReferenceRow>> {
  const uniqueKeys = [...new Set(objectKeys)];
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const rows = (await executor.execute(sql`
    SELECT
      product_media.id AS product_media_id,
      product_media.product_id,
      product_media.variant_id,
      product_variants.product_id AS variant_product_id,
      media_assets.object_key,
      media_assets.security_class,
      media_assets.media_type,
      media_assets.mime_type
    FROM product_media
    INNER JOIN media_assets ON media_assets.id = product_media.media_asset_id
    LEFT JOIN product_variants ON product_variants.id = product_media.variant_id
    WHERE product_media.product_id = ${productId}::uuid
      AND media_assets.object_key IN (${sqlTextList(uniqueKeys)})
    ORDER BY product_media.display_order, product_media.created_at, product_media.id
    FOR SHARE OF product_media, media_assets;
  `)) as unknown as MediaReferenceRow[];

  const byObjectKey = new Map<string, MediaReferenceRow>();
  for (const row of rows) {
    if (!byObjectKey.has(row.object_key)) {
      byObjectKey.set(row.object_key, row);
    }
  }
  return byObjectKey;
}

function assertMediaReference(
  row: MediaReferenceRow | undefined,
  productId: string,
  kind: MediaKind,
  path: string
): MediaReferenceRow {
  if (!row) {
    throw referenceError(path, "STORY_MEDIA_NOT_FOUND", "El medio seleccionado no existe.");
  }
  if (row.product_id !== productId) {
    throw referenceError(
      path,
      "STORY_MEDIA_PRODUCT_MISMATCH",
      "El medio seleccionado no pertenece a este producto."
    );
  }
  if (row.variant_id !== null && row.variant_product_id !== productId) {
    throw referenceError(
      path,
      "STORY_MEDIA_VARIANT_MISMATCH",
      "La variante asociada al medio no pertenece a este producto."
    );
  }
  if (row.security_class !== "PUBLIC_MEDIA") {
    throw referenceError(
      path,
      "STORY_MEDIA_NOT_PUBLIC",
      "Solo se permiten medios públicos del catálogo."
    );
  }
  if (row.media_type !== kind) {
    throw referenceError(
      path,
      "STORY_MEDIA_TYPE_MISMATCH",
      kind === "IMAGE"
        ? "Este campo requiere una imagen pública."
        : "Este campo requiere un video público."
    );
  }
  const mimeAllowed =
    kind === "IMAGE" ? IMAGE_MIME_TYPES.has(row.mime_type) : VIDEO_MIME_TYPES.has(row.mime_type);
  if (!mimeAllowed) {
    throw referenceError(
      path,
      "STORY_MEDIA_MIME_UNSUPPORTED",
      "El formato del medio no es compatible con la historia."
    );
  }
  if (resolvePublicMediaUrl(row.object_key) === null) {
    throw referenceError(
      path,
      "STORY_MEDIA_PUBLIC_URL_INVALID",
      "El medio no tiene una resolución pública segura."
    );
  }
  return row;
}

async function loadRelatedProducts(
  executor: StoryExecutor,
  ids: readonly string[]
): Promise<Map<string, RelatedProductRow>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = (await executor.execute(sql`
    SELECT
      products.id,
      products.slug,
      products.status,
      brands.status AS brand_status,
      categories.status AS category_status,
      EXISTS (
        SELECT 1
        FROM product_variants
        WHERE product_variants.product_id = products.id
          AND product_variants.status = 'ACTIVE'
      ) AS has_active_variant
    FROM products
    INNER JOIN brands ON brands.id = products.brand_id
    INNER JOIN categories ON categories.id = products.category_id
    WHERE products.id IN (${sqlUuidList(uniqueIds)})
    ORDER BY products.id
    FOR SHARE OF products, brands, categories;
  `)) as unknown as RelatedProductRow[];

  return new Map(rows.map((row) => [row.id, row]));
}

async function loadRelatedProductsBySlugs(
  executor: StoryExecutor,
  slugs: readonly string[]
): Promise<Map<string, RelatedProductRow>> {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) {
    return new Map();
  }

  const rows = (await executor.execute(sql`
    SELECT
      products.id,
      products.slug,
      products.status,
      brands.status AS brand_status,
      categories.status AS category_status,
      EXISTS (
        SELECT 1
        FROM product_variants
        WHERE product_variants.product_id = products.id
          AND product_variants.status = 'ACTIVE'
      ) AS has_active_variant
    FROM products
    INNER JOIN brands ON brands.id = products.brand_id
    INNER JOIN categories ON categories.id = products.category_id
    WHERE products.slug IN (${sqlTextList(uniqueSlugs)})
    ORDER BY products.id
    FOR SHARE OF products, brands, categories;
  `)) as unknown as RelatedProductRow[];

  return new Map(rows.map((row) => [row.slug, row]));
}

function assertRelatedProduct(
  row: RelatedProductRow | undefined,
  currentProductId: string,
  requirePublicEligibility: boolean,
  path: string
): RelatedProductRow {
  if (!row) {
    throw referenceError(
      path,
      "STORY_RELATED_PRODUCT_NOT_FOUND",
      "El producto relacionado no existe."
    );
  }
  if (row.id === currentProductId) {
    throw referenceError(
      path,
      "STORY_RELATED_PRODUCT_SELF_REFERENCE",
      "Un producto no puede relacionarse consigo mismo."
    );
  }
  if (
    requirePublicEligibility &&
    (row.status !== "PUBLISHED" ||
      row.brand_status !== "PUBLISHED" ||
      row.category_status !== "PUBLISHED" ||
      !row.has_active_variant)
  ) {
    throw referenceError(
      path,
      "STORY_RELATED_PRODUCT_NOT_PUBLIC",
      "El producto relacionado ya no cumple los requisitos de publicación."
    );
  }
  return row;
}

function collectAuthoringRelatedIds(document: AuthoringStoryDocument): string[] {
  return document.flatMap((block) =>
    block.type === "related_products" ? block.payload.productIds : []
  );
}

function collectPersistedRelatedSlugs(document: StrictPersistedStoryDocument): string[] {
  return document.flatMap((block) =>
    block.type === "related_products" ? block.payload.productSlugs : []
  );
}

export async function resolveAuthoringStoryDocument(
  executor: StoryExecutor,
  productId: string,
  document: AuthoringStoryDocument,
  options: { requirePublicRelatedProducts: boolean }
): Promise<StrictPersistedStoryDocument> {
  const mediaSelections = collectAuthoringMedia(document);
  const mediaById = await loadMediaByIds(
    executor,
    mediaSelections.map((selection) => selection.id)
  );
  const relatedById = await loadRelatedProducts(executor, collectAuthoringRelatedIds(document));

  const mediaKey = (id: string | undefined, kind: MediaKind, path: string): string | undefined => {
    if (id === undefined) {
      return undefined;
    }
    return assertMediaReference(mediaById.get(id), productId, kind, path).object_key;
  };

  return document.map((block, blockIndex) => {
    const path = `blocks[${blockIndex}].payload`;
    const envelope = { block_id: block.blockId, type: block.type, order: blockIndex + 1 };
    switch (block.type) {
      case "hero_media":
        return {
          ...envelope,
          type: block.type,
          payload: {
            headline: block.payload.headline,
            tagline: block.payload.tagline,
            body: block.payload.body,
            mediaKey: mediaKey(block.payload.mediaId, "IMAGE", `${path}.mediaId`),
            posterKey: mediaKey(block.payload.posterMediaId, "IMAGE", `${path}.posterMediaId`),
            videoKey: mediaKey(block.payload.videoMediaId, "VIDEO", `${path}.videoMediaId`),
          },
        };
      case "full_bleed_image":
        return {
          ...envelope,
          type: block.type,
          payload: {
            mediaKey: mediaKey(block.payload.mediaId, "IMAGE", `${path}.mediaId`) ?? "",
            altText: block.payload.altText,
            caption: block.payload.caption,
          },
        };
      case "image_text":
        return {
          ...envelope,
          type: block.type,
          payload: {
            headline: block.payload.headline,
            body: block.payload.body,
            mediaKey: mediaKey(block.payload.mediaId, "IMAGE", `${path}.mediaId`) ?? "",
            imagePosition: block.payload.imagePosition,
          },
        };
      case "stat_highlight":
        return { ...envelope, type: block.type, payload: block.payload };
      case "comparison":
        return { ...envelope, type: block.type, payload: block.payload };
      case "technical_specs":
        return { ...envelope, type: block.type, payload: block.payload };
      case "faq":
        return { ...envelope, type: block.type, payload: block.payload };
      case "spec_feature":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            description: block.payload.description,
            mediaKey: mediaKey(block.payload.mediaId, "IMAGE", `${path}.mediaId`),
            badge: block.payload.badge,
          },
        };
      case "video":
        return {
          ...envelope,
          type: block.type,
          payload: {
            videoKey: mediaKey(block.payload.videoMediaId, "VIDEO", `${path}.videoMediaId`) ?? "",
            posterKey: mediaKey(block.payload.posterMediaId, "IMAGE", `${path}.posterMediaId`),
            title: block.payload.title,
            caption: block.payload.caption,
          },
        };
      case "gallery":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            items: block.payload.items.map((item, itemIndex) => ({
              mediaKey:
                mediaKey(item.mediaId, "IMAGE", `${path}.items[${itemIndex}].mediaId`) ?? "",
              altText: item.altText,
              caption: item.caption,
            })),
          },
        };
      case "dimensions":
        return {
          ...envelope,
          type: block.type,
          payload: {
            blueprintMediaKey: mediaKey(
              block.payload.blueprintMediaId,
              "IMAGE",
              `${path}.blueprintMediaId`
            ),
            lengthMm: block.payload.lengthMm,
            widthMm: block.payload.widthMm,
            heightMm: block.payload.heightMm,
            gripTypes: block.payload.gripTypes,
          },
        };
      case "box_contents":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            items: block.payload.items.map((item, itemIndex) => ({
              title: item.title,
              mediaKey: mediaKey(item.mediaId, "IMAGE", `${path}.items[${itemIndex}].mediaId`),
              count: item.count,
            })),
          },
        };
      case "related_products":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            productSlugs: block.payload.productIds.map(
              (relatedId, relatedIndex) =>
                assertRelatedProduct(
                  relatedById.get(relatedId),
                  productId,
                  options.requirePublicRelatedProducts,
                  `${path}.productIds[${relatedIndex}]`
                ).slug
            ),
          },
        };
    }
  });
}

export async function validatePersistedStoryReferences(
  executor: StoryExecutor,
  productId: string,
  document: StrictPersistedStoryDocument,
  options: {
    requirePublicRelatedProducts: boolean;
    /**
     * Related products are stored by slug, so deleting a product or changing its slug leaves
     * other stories pointing at nothing. Admin reads skip those instead of failing the whole
     * editor; saving still validates strictly, so the next save drops them for good.
     */
    skipMissingRelatedProducts?: boolean;
  }
): Promise<void> {
  const mediaReferences = collectPersistedMedia(document);
  const mediaByObjectKey = await loadMediaByObjectKeys(
    executor,
    productId,
    mediaReferences.map((reference) => reference.objectKey)
  );
  for (const reference of mediaReferences) {
    assertMediaReference(
      mediaByObjectKey.get(reference.objectKey),
      productId,
      reference.kind,
      reference.path
    );
  }

  const relatedSlugs = collectPersistedRelatedSlugs(document);
  const relatedBySlug = await loadRelatedProductsBySlugs(executor, relatedSlugs);
  document.forEach((block, blockIndex) => {
    if (block.type !== "related_products") {
      return;
    }
    block.payload.productSlugs.forEach((slug, relatedIndex) => {
      if (options.skipMissingRelatedProducts && !relatedBySlug.has(slug)) return;
      assertRelatedProduct(
        relatedBySlug.get(slug),
        productId,
        options.requirePublicRelatedProducts,
        `blocks[${blockIndex}].payload.productSlugs[${relatedIndex}]`
      );
    });
  });
}

export async function convertPersistedStoryToAuthoring(
  executor: StoryExecutor,
  productId: string,
  document: StrictPersistedStoryDocument
): Promise<AuthoringStoryDocument> {
  await validatePersistedStoryReferences(executor, productId, document, {
    requirePublicRelatedProducts: false,
    skipMissingRelatedProducts: true,
  });
  const mediaByObjectKey = await loadMediaByObjectKeys(
    executor,
    productId,
    collectPersistedMedia(document).map((reference) => reference.objectKey)
  );
  const relatedBySlug = await loadRelatedProductsBySlugs(
    executor,
    collectPersistedRelatedSlugs(document)
  );
  const mediaId = (objectKey: string | undefined): string | undefined => {
    if (objectKey === undefined) {
      return undefined;
    }
    return mediaByObjectKey.get(objectKey)?.product_media_id;
  };

  return document.map((block) => {
    const envelope = { blockId: block.block_id, type: block.type };
    switch (block.type) {
      case "hero_media":
        return {
          ...envelope,
          type: block.type,
          payload: {
            headline: block.payload.headline,
            tagline: block.payload.tagline,
            body: block.payload.body,
            mediaId: mediaId(block.payload.mediaKey),
            posterMediaId: mediaId(block.payload.posterKey),
            videoMediaId: mediaId(block.payload.videoKey),
          },
        };
      case "full_bleed_image":
        return {
          ...envelope,
          type: block.type,
          payload: {
            mediaId: mediaId(block.payload.mediaKey) ?? "",
            altText: block.payload.altText,
            caption: block.payload.caption,
          },
        };
      case "image_text":
        return {
          ...envelope,
          type: block.type,
          payload: {
            headline: block.payload.headline,
            body: block.payload.body,
            mediaId: mediaId(block.payload.mediaKey) ?? "",
            imagePosition: block.payload.imagePosition,
          },
        };
      case "stat_highlight":
        return { ...envelope, type: block.type, payload: block.payload };
      case "comparison":
        return { ...envelope, type: block.type, payload: block.payload };
      case "technical_specs":
        return { ...envelope, type: block.type, payload: block.payload };
      case "faq":
        return { ...envelope, type: block.type, payload: block.payload };
      case "spec_feature":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            description: block.payload.description,
            mediaId: mediaId(block.payload.mediaKey),
            badge: block.payload.badge,
          },
        };
      case "video":
        return {
          ...envelope,
          type: block.type,
          payload: {
            videoMediaId: mediaId(block.payload.videoKey) ?? "",
            posterMediaId: mediaId(block.payload.posterKey),
            title: block.payload.title,
            caption: block.payload.caption,
          },
        };
      case "gallery":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            items: block.payload.items.map((item) => ({
              mediaId: mediaId(item.mediaKey) ?? "",
              altText: item.altText,
              caption: item.caption,
            })),
          },
        };
      case "dimensions":
        return {
          ...envelope,
          type: block.type,
          payload: {
            blueprintMediaId: mediaId(block.payload.blueprintMediaKey),
            lengthMm: block.payload.lengthMm,
            widthMm: block.payload.widthMm,
            heightMm: block.payload.heightMm,
            gripTypes: block.payload.gripTypes,
          },
        };
      case "box_contents":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            items: block.payload.items.map((item) => ({
              title: item.title,
              mediaId: mediaId(item.mediaKey),
              count: item.count,
            })),
          },
        };
      case "related_products":
        return {
          ...envelope,
          type: block.type,
          payload: {
            title: block.payload.title,
            productIds: block.payload.productSlugs.flatMap((slug) => {
              const relatedId = relatedBySlug.get(slug)?.id;
              return relatedId ? [relatedId] : [];
            }),
          },
        };
    }
  });
}
