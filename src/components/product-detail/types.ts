import type { ProductMediaItem, ProductVariantDetail } from "@/lib/catalog/product-detail-types";

/**
 * Narrow Client Component Projection for Commerce Hero.
 *
 * Invariant:
 * Strictly excludes Product Story, Story Blocks, and ProductSpecifications.
 * Only encapsulates public fields necessary for interactive variant selection,
 * media gallery focus, and price/SKU presentation.
 */
export interface CommerceHeroProjection {
  product: {
    id: string;
    name: string;
    subtitle: string | null;
  };
  brand: {
    name: string;
    slug: string;
  };
  variants: ProductVariantDetail[];
  primaryMedia: ProductMediaItem | null;
  media: ProductMediaItem[];
}
