import "server-only";
import { logger } from "@/lib/logger";
import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";
import type {
  ProductDetailEntity,
  ProductMediaItem,
  ProductSpecificationDetail,
  ProductStoryDetail,
  ProductVariantDetail,
} from "./product-detail-types";
import type { ProductDetailReader } from "./product-detail-reader";
import {
  buildActiveProductVariantsByProductIdQuery,
  buildMediaAssetsByIdsQuery,
  buildProductMediaByProductIdQuery,
  buildProductSpecificationByProductIdQuery,
  buildPublishedProductBaseBySlugQuery,
  buildPublishedProductStoryByProductIdQuery,
} from "./postgres-product-detail-queries";

export class PostgresProductDetailReader implements ProductDetailReader {
  async getPublishedProductBySlug(slug: string): Promise<ProductDetailEntity | null> {
    // Query 1: Base Product with Brand & Category (must all be PUBLISHED)
    const baseRows = await buildPublishedProductBaseBySlugQuery(slug);
    const productBase = baseRows[0];
    if (!productBase) {
      return null;
    }

    // Query 2: Active Product Variants (must have >= 1 ACTIVE variant)
    const variantRows = await buildActiveProductVariantsByProductIdQuery(productBase.id);
    if (!variantRows || variantRows.length === 0) {
      return null;
    }

    const activeVariantsMap = new Map<string, (typeof variantRows)[number]>();
    const activeVariants: ProductVariantDetail[] = [];

    for (const v of variantRows) {
      activeVariantsMap.set(v.id, v);
      activeVariants.push({
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        title: v.title,
        priceCents: v.priceCents,
        compareAtPriceCents: v.compareAtPriceCents,
        costCents: v.costCents,
        weightGrams: v.weightGrams,
        displayOrder: v.displayOrder,
        status: "ACTIVE",
        attributes: v.attributes ?? {},
      });
    }

    // Query 3: Product Media rows
    const mediaRows = await buildProductMediaByProductIdQuery(productBase.id);

    // Query 4: Batched Media Assets resolution
    const mediaAssetIdSet = new Set<string>();
    if (productBase.primaryMediaId) {
      mediaAssetIdSet.add(productBase.primaryMediaId);
    }
    if (productBase.brand.logoMediaId) {
      mediaAssetIdSet.add(productBase.brand.logoMediaId);
    }
    for (const m of mediaRows) {
      mediaAssetIdSet.add(m.mediaAssetId);
    }

    const assetRows = await buildMediaAssetsByIdsQuery(Array.from(mediaAssetIdSet));
    const assetMap = new Map<string, (typeof assetRows)[number]>();
    for (const a of assetRows) {
      assetMap.set(a.id, a);
    }

    // Defensive Product Media filtering & projection
    const resolvedMedia: ProductMediaItem[] = [];
    for (const m of mediaRows) {
      // Invariant check: variant-specific media must point to an active variant belonging to this product
      if (m.variantId !== null) {
        const matchingVariant = activeVariantsMap.get(m.variantId);
        if (!matchingVariant || matchingVariant.productId !== productBase.id) {
          logger.warn({
            event: "pdp_invalid_variant_media_dropped",
            productId: productBase.id,
            productMediaId: m.id,
            variantId: m.variantId,
            reason: matchingVariant ? "mismatched_product" : "unknown_or_inactive_variant",
          });
          continue;
        }
      }

      const asset = assetMap.get(m.mediaAssetId);
      if (!asset) {
        // Missing or non-public media asset
        continue;
      }

      resolvedMedia.push({
        id: m.id,
        productId: m.productId,
        mediaAssetId: m.mediaAssetId,
        variantId: m.variantId,
        displayOrder: m.displayOrder,
        asset: {
          objectKey: asset.objectKey,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.fileSizeBytes,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
        },
      });
    }

    // Primary Media projection
    let primaryMedia: ProductMediaItem | null = null;
    if (productBase.primaryMediaId) {
      const primaryAsset = assetMap.get(productBase.primaryMediaId);
      if (primaryAsset) {
        primaryMedia = {
          id: productBase.primaryMediaId,
          productId: productBase.id,
          mediaAssetId: productBase.primaryMediaId,
          variantId: null,
          displayOrder: 0,
          asset: {
            objectKey: primaryAsset.objectKey,
            mimeType: primaryAsset.mimeType,
            fileSizeBytes: primaryAsset.fileSizeBytes,
            width: primaryAsset.width,
            height: primaryAsset.height,
            altText: primaryAsset.altText,
          },
        };
      }
    } else if (resolvedMedia.length > 0 && resolvedMedia[0]) {
      primaryMedia = resolvedMedia[0];
    }

    // Brand logo projection
    let brandLogo: { objectKey: string; altText: string | null } | null = null;
    if (productBase.brand.logoMediaId) {
      const logoAsset = assetMap.get(productBase.brand.logoMediaId);
      if (logoAsset) {
        brandLogo = {
          objectKey: logoAsset.objectKey,
          altText: logoAsset.altText,
        };
      }
    }

    // Query 5: Product Specifications
    let specifications: ProductSpecificationDetail | null = null;
    const specRows = await buildProductSpecificationByProductIdQuery(productBase.id);
    const specRow = specRows[0];
    if (specRow) {
      const validatedSchema = validateSpecificationSchema({
        id: specRow.schemaId,
        categoryId: specRow.schemaCategoryId,
        schemaVersion: specRow.schemaVersion,
        fieldDefinitions: specRow.schemaFieldDefinitions,
      });

      if (validatedSchema) {
        specifications = {
          id: specRow.productId,
          productId: specRow.productId,
          schemaId: specRow.schemaId,
          schemaVersion: specRow.schemaVersion,
          specValues: specRow.specValues ?? {},
          schema: validatedSchema,
        };
      }
    }

    // Query 6: Published Product Story
    let story: ProductStoryDetail | null = null;
    const storyRows = await buildPublishedProductStoryByProductIdQuery(productBase.id);
    const storyRow = storyRows[0];
    if (storyRow) {
      // Defensive story invariant check: revision must belong to this product and be PUBLISHED
      if (
        storyRow.revisionProductId === productBase.id &&
        storyRow.revisionStatus === "PUBLISHED" &&
        storyRow.publishedAt !== null
      ) {
        story = {
          productId: storyRow.productId,
          publishedRevisionId: storyRow.publishedRevisionId as string,
          revisionNumber: storyRow.revisionNumber,
          publishedAt: storyRow.publishedAt.toISOString(),
          blocks: Array.isArray(storyRow.blocks) ? storyRow.blocks : [],
        };
      } else {
        logger.warn({
          event: "pdp_invalid_published_story_revision_dropped",
          productId: productBase.id,
          publishedRevisionId: storyRow.publishedRevisionId,
          revisionProductId: storyRow.revisionProductId,
          revisionStatus: storyRow.revisionStatus,
        });
      }
    }

    return {
      id: productBase.id,
      name: productBase.name,
      slug: productBase.slug,
      subtitle: productBase.subtitle,
      description: productBase.description,
      createdAt: productBase.createdAt.toISOString(),
      updatedAt: productBase.updatedAt.toISOString(),
      brand: {
        id: productBase.brand.id,
        name: productBase.brand.name,
        slug: productBase.brand.slug,
        description: productBase.brand.description,
        logo: brandLogo,
      },
      category: {
        id: productBase.category.id,
        name: productBase.category.name,
        slug: productBase.category.slug,
        description: productBase.category.description,
      },
      primaryMedia,
      variants: activeVariants,
      media: resolvedMedia,
      specifications,
      story,
    };
  }
}
