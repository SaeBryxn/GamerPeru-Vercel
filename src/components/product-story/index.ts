export { ProductStoryRenderer } from "./product-story-renderer";
export type { ProductStoryRendererProps } from "./types";
export { resolveStoryAlt } from "./helpers/resolve-story-alt";
export { sanitizeComparisonRows } from "./helpers/comparison-matrix";
export { shouldAutoplayStoryVideo } from "./helpers/should-autoplay-story-video";
export { shouldPauseForReducedMotionTransition } from "./helpers/should-pause-for-reduced-motion-transition";

// Export blocks for testing/modular reuse
export { HeroMediaBlock } from "./blocks/hero-media-block";
export { StoryAmbientVideo } from "./blocks/story-ambient-video";
export { FullBleedImageBlock } from "./blocks/full-bleed-image-block";
export { ImageTextBlock } from "./blocks/image-text-block";
export { StatHighlightBlock } from "./blocks/stat-highlight-block";
export { SpecFeatureBlock } from "./blocks/spec-feature-block";
export { VideoBlock } from "./blocks/video-block";
export { StoryVideoPlayer } from "./blocks/story-video-player";
export { GalleryBlock } from "./blocks/gallery-block";
export { ComparisonBlock } from "./blocks/comparison-block";
export { DimensionsBlock } from "./blocks/dimensions-block";
export { BoxContentsBlock } from "./blocks/box-contents-block";
export { TechnicalSpecsBlock } from "./blocks/technical-specs-block";
export { FaqBlock } from "./blocks/faq-block";
export { RelatedProductsBlock } from "./blocks/related-products-block";
