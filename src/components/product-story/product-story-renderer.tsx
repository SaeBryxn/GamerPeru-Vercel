import React from "react";
import type { ValidatedStoryBlock } from "@/lib/catalog/story-validation";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import type { ProductStoryRendererProps } from "./types";
import { HeroMediaBlock } from "./blocks/hero-media-block";
import { FullBleedImageBlock } from "./blocks/full-bleed-image-block";
import { ImageTextBlock } from "./blocks/image-text-block";
import { StatHighlightBlock } from "./blocks/stat-highlight-block";
import { SpecFeatureBlock } from "./blocks/spec-feature-block";
import { VideoBlock } from "./blocks/video-block";
import { GalleryBlock } from "./blocks/gallery-block";
import { ComparisonBlock } from "./blocks/comparison-block";
import { DimensionsBlock } from "./blocks/dimensions-block";
import { BoxContentsBlock } from "./blocks/box-contents-block";
import { TechnicalSpecsBlock } from "./blocks/technical-specs-block";
import { FaqBlock } from "./blocks/faq-block";
import { RelatedProductsBlock } from "./blocks/related-products-block";
import styles from "./product-story-renderer.module.css";

/** Image-led blocks run edge to edge; every other block keeps a centered reading frame. */
const FULL_WIDTH_BLOCKS: ReadonlySet<ValidatedStoryBlock["type"]> = new Set([
  "hero_media",
  "full_bleed_image",
  "gallery",
]);

function renderStoryBlock(
  block: ValidatedStoryBlock,
  productName: string,
  currentProductId: string,
  relatedProductsMap?: ReadonlyMap<string, ProductDiscoveryItem>
): React.JSX.Element | null {
  switch (block.type) {
    case "hero_media":
      return <HeroMediaBlock payload={block.payload} productName={productName} />;
    case "full_bleed_image":
      return <FullBleedImageBlock payload={block.payload} productName={productName} />;
    case "image_text":
      return <ImageTextBlock payload={block.payload} productName={productName} />;
    case "stat_highlight":
      return <StatHighlightBlock payload={block.payload} />;
    case "spec_feature":
      return <SpecFeatureBlock payload={block.payload} productName={productName} />;
    case "video":
      return <VideoBlock payload={block.payload} productName={productName} />;
    case "gallery":
      return <GalleryBlock payload={block.payload} productName={productName} />;
    case "comparison":
      return <ComparisonBlock payload={block.payload} />;
    case "dimensions":
      return <DimensionsBlock payload={block.payload} productName={productName} />;
    case "box_contents":
      return <BoxContentsBlock payload={block.payload} productName={productName} />;
    case "technical_specs":
      return <TechnicalSpecsBlock payload={block.payload} />;
    case "faq":
      return <FaqBlock payload={block.payload} />;
    case "related_products":
      return (
        <RelatedProductsBlock
          payload={block.payload}
          productsMap={relatedProductsMap}
          currentProductId={currentProductId}
        />
      );
    default: {
      const _exhaustiveCheck: never = block;
      return null;
    }
  }
}

export function ProductStoryRenderer({
  story,
  currentProductId,
  productName,
  relatedProductsMap,
}: ProductStoryRendererProps): React.JSX.Element | null {
  if (!story || !story.blocks || story.blocks.length === 0) {
    return null;
  }

  const renderedBlocks = story.blocks
    .map((block) => {
      const element = renderStoryBlock(block, productName, currentProductId, relatedProductsMap);
      if (!element) return null;
      return (
        <div
          key={block.blockId}
          className={FULL_WIDTH_BLOCKS.has(block.type) ? styles.fullWidthFrame : styles.blockFrame}
        >
          {element}
        </div>
      );
    })
    .filter(Boolean);

  if (renderedBlocks.length === 0) {
    return null;
  }

  return (
    <section
      className={styles.storySection}
      aria-label="Historia del producto"
      data-testid="product-story-section"
    >
      {renderedBlocks}
    </section>
  );
}
