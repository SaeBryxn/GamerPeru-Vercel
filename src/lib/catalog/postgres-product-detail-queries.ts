import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  categories,
  categorySpecificationSchemas,
  mediaAssets,
  productMedia,
  productSpecifications,
  productStories,
  productStoryRevisions,
  products,
  productVariants,
} from "@/db/schema";

/**
 * Query 1: Published Product base record by slug.
 * Joins brands and categories to guarantee all 3 are in PUBLISHED status.
 */
export function buildPublishedProductBaseBySlugQuery(slug: string) {
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      description: products.description,
      primaryMediaId: products.primaryMediaId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      brand: {
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        description: brands.description,
        logoMediaId: brands.logoMediaId,
      },
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        currentSpecSchemaId: categories.currentSpecSchemaId,
      },
    })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
    .innerJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
    )
    .where(and(eq(products.slug, slug), eq(products.status, "PUBLISHED")))
    .limit(1);
}

/**
 * Query 2: Active Product Variants for a product.
 * Returns only variants with status = 'ACTIVE', deterministically ordered.
 */
export function buildActiveProductVariantsByProductIdQuery(productId: string) {
  return db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      title: productVariants.title,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      weightGrams: productVariants.weightGrams,
      displayOrder: productVariants.displayOrder,
      status: productVariants.status,
      attributes: productVariants.attributes,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.status, "ACTIVE")))
    .orderBy(
      asc(productVariants.displayOrder),
      asc(productVariants.createdAt),
      asc(productVariants.id)
    );
}

/**
 * Query 3: Product Media rows associated with a product.
 * Ordered by displayOrder ascending.
 */
export function buildProductMediaByProductIdQuery(productId: string) {
  return db
    .select({
      id: productMedia.id,
      productId: productMedia.productId,
      mediaAssetId: productMedia.mediaAssetId,
      variantId: productMedia.variantId,
      displayOrder: productMedia.displayOrder,
      createdAt: productMedia.createdAt,
    })
    .from(productMedia)
    .where(and(eq(productMedia.productId, productId), eq(productMedia.placement, "GALLERY")))
    .orderBy(asc(productMedia.displayOrder), asc(productMedia.createdAt), asc(productMedia.id));
}

/**
 * Query 4: Batched Media Assets resolution by IDs.
 * Filters strictly by securityClass = 'PUBLIC_MEDIA'.
 */
export function buildMediaAssetsByIdsQuery(assetIds: string[]) {
  if (assetIds.length === 0) {
    return Promise.resolve([]);
  }
  return db
    .select({
      id: mediaAssets.id,
      objectKey: mediaAssets.objectKey,
      mimeType: mediaAssets.mimeType,
      fileSizeBytes: mediaAssets.fileSizeBytes,
      width: mediaAssets.width,
      height: mediaAssets.height,
      altText: mediaAssets.altText,
      securityClass: mediaAssets.securityClass,
    })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, assetIds), eq(mediaAssets.securityClass, "PUBLIC_MEDIA")));
}

/**
 * Query 5: Product Specifications for a product and its category schema.
 */
export function buildProductSpecificationByProductIdQuery(productId: string) {
  return db
    .select({
      productId: productSpecifications.productId,
      schemaId: productSpecifications.schemaId,
      productSchemaVersion: productSpecifications.schemaVersion,
      specValues: productSpecifications.specValues,
      schemaFieldDefinitions: categorySpecificationSchemas.fieldDefinitions,
      schemaCategoryId: categorySpecificationSchemas.categoryId,
      categorySchemaVersion: categorySpecificationSchemas.schemaVersion,
    })
    .from(productSpecifications)
    .innerJoin(
      categorySpecificationSchemas,
      eq(productSpecifications.schemaId, categorySpecificationSchemas.id)
    )
    .where(eq(productSpecifications.productId, productId))
    .limit(1);
}

/**
 * Query 6: Published Product Story with active published revision.
 */
export function buildPublishedProductStoryByProductIdQuery(productId: string) {
  return db
    .select({
      productId: productStories.productId,
      publishedRevisionId: productStories.publishedRevisionId,
      revisionNumber: productStoryRevisions.revisionNumber,
      revisionStatus: productStoryRevisions.status,
      revisionProductId: productStoryRevisions.productId,
      blocks: productStoryRevisions.blocks,
      publishedAt: productStoryRevisions.publishedAt,
    })
    .from(productStories)
    .innerJoin(
      productStoryRevisions,
      eq(productStories.publishedRevisionId, productStoryRevisions.id)
    )
    .where(eq(productStories.productId, productId))
    .limit(1);
}
