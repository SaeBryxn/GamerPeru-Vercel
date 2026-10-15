import { z } from "zod";
import { logger } from "@/lib/logger";

export const MAX_STORY_BLOCKS_PER_REVISION = 30;

const NO_HTML_SCRIPT_REGEX = /<[^>]*>/;

function isSafePlainText(val: string): boolean {
  return !NO_HTML_SCRIPT_REGEX.test(val);
}

export const SafeString = (minLen: number, maxLen: number) =>
  z
    .string()
    .min(minLen)
    .max(maxLen)
    .refine((val) => isSafePlainText(val), {
      message: "Forbidden HTML tags or characters in text payload",
    });

// 1. HeroMedia (hero_media)
export const HeroMediaPayloadSchema = z.object({
  headline: SafeString(1, 200),
  tagline: SafeString(1, 500).optional(),
  body: SafeString(1, 1000).optional(),
  mediaKey: SafeString(1, 300).optional(),
  posterKey: SafeString(1, 300).optional(),
  videoKey: SafeString(1, 300).optional(),
});
export type HeroMediaPayload = z.infer<typeof HeroMediaPayloadSchema>;

// 2. FullBleedImage (full_bleed_image)
export const FullBleedImagePayloadSchema = z.object({
  mediaKey: SafeString(1, 300),
  altText: SafeString(1, 200).optional(),
  caption: SafeString(1, 300).optional(),
});
export type FullBleedImagePayload = z.infer<typeof FullBleedImagePayloadSchema>;

// 3. ImageText (image_text)
export const ImageTextPayloadSchema = z.object({
  headline: SafeString(1, 200),
  body: SafeString(1, 2000),
  mediaKey: SafeString(1, 300),
  imagePosition: z.enum(["left", "right"]).optional().default("left"),
});
export type ImageTextPayload = z.infer<typeof ImageTextPayloadSchema>;

// 4. StatHighlight (stat_highlight)
export const StatItemSchema = z.object({
  value: SafeString(1, 50),
  label: SafeString(1, 100),
  unit: SafeString(1, 20).optional(),
});
export const StatHighlightPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  stats: z.array(StatItemSchema).min(1).max(6),
});
export type StatHighlightPayload = z.infer<typeof StatHighlightPayloadSchema>;

// 5. SpecFeature (spec_feature)
export const SpecFeaturePayloadSchema = z.object({
  title: SafeString(1, 200),
  description: SafeString(1, 2000),
  mediaKey: SafeString(1, 300).optional(),
  badge: SafeString(1, 50).optional(),
});
export type SpecFeaturePayload = z.infer<typeof SpecFeaturePayloadSchema>;

// 6. Video (video)
export const VideoPayloadSchema = z.object({
  videoKey: SafeString(1, 300),
  posterKey: SafeString(1, 300).optional(),
  title: SafeString(1, 200).optional(),
  caption: SafeString(1, 500).optional(),
});
export type VideoPayload = z.infer<typeof VideoPayloadSchema>;

// 7. Gallery (gallery) — 3 to 6 high-resolution images
export const GalleryItemSchema = z.object({
  mediaKey: SafeString(1, 300),
  altText: SafeString(1, 200).optional(),
  caption: SafeString(1, 300).optional(),
});
export const GalleryPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  items: z.array(GalleryItemSchema).min(3).max(6),
});
export type GalleryPayload = z.infer<typeof GalleryPayloadSchema>;

// 8. Comparison (comparison)
export const ComparisonPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  headers: z.array(SafeString(1, 100)).min(2).max(6),
  rows: z
    .array(z.array(SafeString(1, 200)).min(2).max(6))
    .min(1)
    .max(20),
});
export type ComparisonPayload = z.infer<typeof ComparisonPayloadSchema>;

// 9. Dimensions (dimensions)
export const DimensionsPayloadSchema = z
  .object({
    blueprintMediaKey: SafeString(1, 300).optional(),
    lengthMm: z.number().positive().max(1000).optional(),
    widthMm: z.number().positive().max(1000).optional(),
    heightMm: z.number().positive().max(1000).optional(),
    gripTypes: z.array(SafeString(1, 50)).min(1).max(10).optional(),
  })
  .refine(
    (data) =>
      data.blueprintMediaKey !== undefined ||
      data.lengthMm !== undefined ||
      data.widthMm !== undefined ||
      data.heightMm !== undefined ||
      (data.gripTypes !== undefined && data.gripTypes.length > 0),
    {
      message: "Dimensions block requires at least one dimension, blueprint, or grip type",
    }
  );
export type DimensionsPayload = z.infer<typeof DimensionsPayloadSchema>;

// 10. BoxContents (box_contents)
export const BoxContentsItemSchema = z.object({
  title: SafeString(1, 100),
  mediaKey: SafeString(1, 300).optional(),
  count: z.number().int().min(1).max(100).optional(),
});
export const BoxContentsPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  items: z.array(BoxContentsItemSchema).min(1).max(12),
});
export type BoxContentsPayload = z.infer<typeof BoxContentsPayloadSchema>;

// 11. TechnicalSpecs (technical_specs)
export const TechnicalSpecsGroupSchema = z.object({
  groupName: SafeString(1, 100),
  specs: z
    .array(
      z.object({
        label: SafeString(1, 100),
        value: SafeString(1, 200),
      })
    )
    .min(1)
    .max(20),
});
export const TechnicalSpecsPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  groups: z.array(TechnicalSpecsGroupSchema).min(1).max(10),
});
export type TechnicalSpecsPayload = z.infer<typeof TechnicalSpecsPayloadSchema>;

// 12. FAQ (faq)
export const FaqItemSchema = z.object({
  question: SafeString(1, 300),
  answer: SafeString(1, 2000),
});
export const FaqPayloadSchema = z.object({
  title: SafeString(1, 200).optional(),
  items: z.array(FaqItemSchema).min(1).max(15),
});
export type FaqPayload = z.infer<typeof FaqPayloadSchema>;

// 13. RelatedProducts (related_products)
export const RelatedProductsPayloadSchema = z
  .object({
    title: SafeString(1, 200).optional(),
    categorySlugs: z.array(SafeString(1, 100)).min(1).max(10).optional(),
    productSlugs: z.array(SafeString(1, 100)).min(1).max(10).optional(),
  })
  .refine(
    (data) =>
      (data.categorySlugs !== undefined && data.categorySlugs.length > 0) ||
      (data.productSlugs !== undefined && data.productSlugs.length > 0),
    {
      message: "RelatedProducts block requires at least one categorySlug or productSlug",
    }
  );
export type RelatedProductsPayload = z.infer<typeof RelatedProductsPayloadSchema>;

export type CanonicalStoryBlockType =
  | "hero_media"
  | "full_bleed_image"
  | "image_text"
  | "stat_highlight"
  | "spec_feature"
  | "video"
  | "gallery"
  | "comparison"
  | "dimensions"
  | "box_contents"
  | "technical_specs"
  | "faq"
  | "related_products";

export const CANONICAL_STORY_BLOCK_TYPES: readonly CanonicalStoryBlockType[] = [
  "hero_media",
  "full_bleed_image",
  "image_text",
  "stat_highlight",
  "spec_feature",
  "video",
  "gallery",
  "comparison",
  "dimensions",
  "box_contents",
  "technical_specs",
  "faq",
  "related_products",
] as const;

export const StoryBlockPayloadSchemas: Record<
  CanonicalStoryBlockType,
  { canonicalType: CanonicalStoryBlockType; schema: z.ZodTypeAny }
> = {
  hero_media: { canonicalType: "hero_media", schema: HeroMediaPayloadSchema },
  full_bleed_image: { canonicalType: "full_bleed_image", schema: FullBleedImagePayloadSchema },
  image_text: { canonicalType: "image_text", schema: ImageTextPayloadSchema },
  stat_highlight: { canonicalType: "stat_highlight", schema: StatHighlightPayloadSchema },
  spec_feature: { canonicalType: "spec_feature", schema: SpecFeaturePayloadSchema },
  video: { canonicalType: "video", schema: VideoPayloadSchema },
  gallery: { canonicalType: "gallery", schema: GalleryPayloadSchema },
  comparison: { canonicalType: "comparison", schema: ComparisonPayloadSchema },
  dimensions: { canonicalType: "dimensions", schema: DimensionsPayloadSchema },
  box_contents: { canonicalType: "box_contents", schema: BoxContentsPayloadSchema },
  technical_specs: { canonicalType: "technical_specs", schema: TechnicalSpecsPayloadSchema },
  faq: { canonicalType: "faq", schema: FaqPayloadSchema },
  related_products: { canonicalType: "related_products", schema: RelatedProductsPayloadSchema },
};

const RawStoryBlockEnvelopeSchema = z.object({
  block_id: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  order: z.number().int().min(1).max(1000),
  payload: z.record(z.string(), z.unknown()),
});

export type ValidatedStoryBlock =
  | { blockId: string; type: "hero_media"; order: number; payload: HeroMediaPayload }
  | { blockId: string; type: "full_bleed_image"; order: number; payload: FullBleedImagePayload }
  | { blockId: string; type: "image_text"; order: number; payload: ImageTextPayload }
  | { blockId: string; type: "stat_highlight"; order: number; payload: StatHighlightPayload }
  | { blockId: string; type: "spec_feature"; order: number; payload: SpecFeaturePayload }
  | { blockId: string; type: "video"; order: number; payload: VideoPayload }
  | { blockId: string; type: "gallery"; order: number; payload: GalleryPayload }
  | { blockId: string; type: "comparison"; order: number; payload: ComparisonPayload }
  | { blockId: string; type: "dimensions"; order: number; payload: DimensionsPayload }
  | { blockId: string; type: "box_contents"; order: number; payload: BoxContentsPayload }
  | { blockId: string; type: "technical_specs"; order: number; payload: TechnicalSpecsPayload }
  | { blockId: string; type: "faq"; order: number; payload: FaqPayload }
  | { blockId: string; type: "related_products"; order: number; payload: RelatedProductsPayload };

export function validateStoryBlocks(
  rawBlocks: unknown,
  diagnosticContext?: { productId?: string; revisionId?: string }
): ValidatedStoryBlock[] | null {
  if (!rawBlocks || !Array.isArray(rawBlocks)) {
    logger.warn({
      event: "pdp_story_blocks_non_array_dropped",
      productId: diagnosticContext?.productId,
      revisionId: diagnosticContext?.revisionId,
    });
    return null;
  }

  if (rawBlocks.length > MAX_STORY_BLOCKS_PER_REVISION) {
    logger.warn({
      event: "pdp_story_block_count_exceeded",
      productId: diagnosticContext?.productId,
      revisionId: diagnosticContext?.revisionId,
      blockCount: rawBlocks.length,
      maxAllowed: MAX_STORY_BLOCKS_PER_REVISION,
    });
    return null;
  }

  const validated: ValidatedStoryBlock[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const rawBlock = rawBlocks[i];
    const envelopeResult = RawStoryBlockEnvelopeSchema.safeParse(rawBlock);

    if (!envelopeResult.success) {
      const blockObj =
        typeof rawBlock === "object" && rawBlock !== null
          ? (rawBlock as Record<string, unknown>)
          : null;
      logger.warn({
        event: "pdp_story_block_validation_failed",
        productId: diagnosticContext?.productId,
        revisionId: diagnosticContext?.revisionId,
        blockId:
          typeof blockObj?.block_id === "string" ? blockObj.block_id.slice(0, 50) : undefined,
        blockIndex: i,
        blockType: typeof blockObj?.type === "string" ? blockObj.type.slice(0, 30) : undefined,
        reason: "invalid_envelope_structure",
      });
      continue;
    }

    const { block_id, type, order, payload } = envelopeResult.data;

    const entry = (
      StoryBlockPayloadSchemas as Record<
        string,
        { canonicalType: CanonicalStoryBlockType; schema: z.ZodTypeAny }
      >
    )[type];
    if (!entry) {
      logger.warn({
        event: "pdp_story_block_validation_failed",
        productId: diagnosticContext?.productId,
        revisionId: diagnosticContext?.revisionId,
        blockId: block_id,
        blockIndex: i,
        blockType: type,
        reason: "unrecognized_block_type",
      });
      continue;
    }

    const payloadResult = entry.schema.safeParse(payload);
    if (!payloadResult.success) {
      logger.warn({
        event: "pdp_story_block_validation_failed",
        productId: diagnosticContext?.productId,
        revisionId: diagnosticContext?.revisionId,
        blockId: block_id,
        blockIndex: i,
        blockType: type,
        reason: "payload_validation_failed",
        firstIssue: payloadResult.error.issues[0]?.message,
      });
      continue;
    }

    validated.push({
      blockId: block_id,
      type: entry.canonicalType,
      order,
      payload: payloadResult.data as never,
    });
  }

  if (validated.length === 0) {
    return null;
  }

  return validated.sort((a, b) => a.order - b.order);
}
