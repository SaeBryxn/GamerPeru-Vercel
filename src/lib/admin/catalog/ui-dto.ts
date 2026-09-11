import type {
  AdminProductDetail,
  AdminProductDetailVariant,
  PublishReadinessResult,
} from "./types";
import type {
  Product,
  Brand,
  Category,
  CategorySpecificationSchema,
  ProductSpecification,
} from "@/db/schema";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";

/**
 * Sanitized client-safe media DTO for Admin Product Detail.
 * The raw objectKey is strictly omitted to prevent private storage keys
 * from crossing the server-to-client boundary or leaking into RSC payloads.
 */
export interface AdminProductUiDetailMedia {
  id: string;
  productId: string;
  mediaAssetId: string;
  variantId: string | null;
  displayOrder: number;
  createdAt: string;
  publicUrl: string | null;
  securityClass: string;
  mediaType: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface AdminProductUiPrimaryMedia {
  mediaAssetId: string;
  publicUrl: string | null;
  securityClass: string;
  mediaType: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface AdminProductUiDetail {
  product: Product;
  brand: Brand;
  category: Category;
  currentSpecSchema: CategorySpecificationSchema | null;
  specifications: ProductSpecification | null;
  variants: AdminProductDetailVariant[];
  media: AdminProductUiDetailMedia[];
  primaryMedia: AdminProductUiPrimaryMedia | null;
  publishReadiness: PublishReadinessResult;
}

/**
 * Transforms an authoritative AdminProductDetail into a sanitized AdminProductUiDetail.
 * Enforces the media security boundary:
 * - Only PUBLIC_MEDIA assets resolve a public browser URL.
 * - Non-PUBLIC_MEDIA assets have publicUrl = null.
 * - Raw objectKey is stripped from all client DTOs.
 */
export function sanitizeProductDetailForUi(detail: AdminProductDetail): AdminProductUiDetail {
  let primaryMediaUi: AdminProductUiPrimaryMedia | null = null;
  if (detail.primaryMedia) {
    const isPublic = detail.primaryMedia.securityClass === "PUBLIC_MEDIA";
    primaryMediaUi = {
      mediaAssetId: detail.primaryMedia.id,
      publicUrl: isPublic ? resolvePublicMediaUrl(detail.primaryMedia.objectKey) : null,
      securityClass: detail.primaryMedia.securityClass,
      mediaType: detail.primaryMedia.mediaType,
      mimeType: detail.primaryMedia.mimeType,
      width: detail.primaryMedia.width,
      height: detail.primaryMedia.height,
      altText: detail.primaryMedia.altText,
    };
  }

  const mediaUi: AdminProductUiDetailMedia[] = detail.media.map((m) => {
    const isPublic = m.mediaAsset.securityClass === "PUBLIC_MEDIA";
    return {
      id: m.id,
      productId: m.productId,
      mediaAssetId: m.mediaAssetId,
      variantId: m.variantId,
      displayOrder: m.displayOrder,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      publicUrl: isPublic ? resolvePublicMediaUrl(m.mediaAsset.objectKey) : null,
      securityClass: m.mediaAsset.securityClass,
      mediaType: m.mediaAsset.mediaType,
      mimeType: m.mediaAsset.mimeType,
      width: m.mediaAsset.width,
      height: m.mediaAsset.height,
      altText: m.mediaAsset.altText,
    };
  });

  return {
    product: detail.product,
    brand: detail.brand,
    category: detail.category,
    currentSpecSchema: detail.currentSpecSchema,
    specifications: detail.specifications,
    variants: detail.variants,
    media: mediaUi,
    primaryMedia: primaryMediaUi,
    publishReadiness: detail.publishReadiness,
  };
}
