import type { ValidatedSpecificationSchema } from "@/lib/discovery-filters/types";
import type { ValidatedStoryBlock } from "./story-validation";
import type { ProductPdpConfig } from "./product-pdp-config";

export type { CanonicalStoryBlockType, ValidatedStoryBlock } from "./story-validation";

export interface ProductDetailBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: {
    objectKey: string;
    altText: string | null;
  } | null;
}

export interface ProductDetailCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ProductVariantDetail {
  thumbnailMediaAssetId?: string | null;
  id: string;
  productId: string;
  sku: string;
  title: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  weightGrams: number | null;
  displayOrder: number;
  status: "ACTIVE";
  attributes: Record<string, string | number | boolean>;
}

export interface ProductMediaItem {
  id: string;
  productId: string;
  mediaAssetId: string;
  variantId: string | null;
  displayOrder: number;
  asset: {
    objectKey: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number | null;
    height: number | null;
    altText: string | null;
  };
}

export interface ProductSpecificationDetail {
  id: string;
  productId: string;
  schemaId: string;
  schemaVersion: number;
  specValues: Record<string, unknown>;
  schema: ValidatedSpecificationSchema;
}

export interface ProductStoryDetail {
  productId: string;
  publishedRevisionId: string;
  revisionNumber: number;
  publishedAt: string;
  blocks: ValidatedStoryBlock[];
}

export interface ProductDetailEntity {
  pdpConfig?: ProductPdpConfig;
  accessories?: ProductPdpAccessory[];
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  brand: ProductDetailBrand;
  category: ProductDetailCategory;
  primaryMedia: ProductMediaItem | null;
  variants: ProductVariantDetail[];
  media: ProductMediaItem[];
  specifications: ProductSpecificationDetail | null;
  story: ProductStoryDetail | null;
}

export interface ProductPdpAccessory {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
}
