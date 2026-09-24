export { ProductBreadcrumb } from "./product-breadcrumb";
export type { ProductBreadcrumbProps } from "./product-breadcrumb";

export { CommerceHeroContainer } from "./commerce-hero-container";
export type { CommerceHeroContainerProps } from "./commerce-hero-container";

export { ProductDetailHero, resolveCanonicalDefaultVariant } from "./product-detail-hero";
export type { ProductDetailHeroProps } from "./product-detail-hero";

export {
  ProductMediaGallery,
  buildEligibleGallery,
  resolveDefaultFocusedIndex,
  resolveInitialLcpMediaAssetId,
  resolveSwipeDirection,
  shouldHandleGallerySwipe,
  getGalleryMediaType,
  isSupportedGalleryMime,
} from "./product-media-gallery";
export type {
  ProductMediaGalleryProps,
  GalleryMediaType,
  SwipeDirection,
  ResolveSwipeParams,
} from "./product-media-gallery";

export { ProductCommercePanel } from "./product-commerce-panel";
export type { ProductCommercePanelProps } from "./product-commerce-panel";

export {
  VariantSelector,
  resolveDimensions,
  isVariantOptionCompatible,
  resolveVariantForOption,
  SWATCH_ALLOWLIST,
} from "./variant-selector";
export type { VariantSelectorProps, ResolvedDimension } from "./variant-selector";

export {
  HardwareSpecifications,
  buildSpecRows,
  formatSpecFieldValue,
} from "./hardware-specifications";
export type { HardwareSpecificationsProps, FormattedSpecRow } from "./hardware-specifications";

export { ProductJsonLd } from "./product-json-ld";
export type { ProductJsonLdProps } from "./product-json-ld";

export type { CommerceHeroProjection } from "./types";

export { PdpAccordion } from "./pdp-accordion";
export type { PdpAccordionItem, PdpAccordionProps } from "./pdp-accordion";

export { PdpAccessories } from "./pdp-accessories";
export type { PdpAccessory, PdpAccessoriesProps } from "./pdp-accessories";

export { PdpSpecGrid } from "./pdp-spec-grid";
export type { PdpSpecGridProps } from "./pdp-spec-grid";
