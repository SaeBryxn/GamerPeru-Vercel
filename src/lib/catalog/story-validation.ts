import { z } from "zod";
import { logger } from "@/lib/logger";

const NO_HTML_SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i;

function isSafeString(val: string): boolean {
  return !NO_HTML_SCRIPT_REGEX.test(val);
}

const SafeString = (maxLen: number) =>
  z
    .string()
    .max(maxLen)
    .refine((val) => isSafeString(val), {
      message: "Forbidden HTML/script tag in text payload",
    });

const HeroMediaPayloadSchema = z.object({
  headline: SafeString(200),
  tagline: SafeString(500).optional(),
  body: SafeString(1000).optional(),
  mediaKey: SafeString(300).optional(),
  posterKey: SafeString(300).optional(),
  videoKey: SafeString(300).optional(),
});

const FullBleedImagePayloadSchema = z.object({
  mediaKey: SafeString(300),
  altText: SafeString(200).optional(),
  caption: SafeString(300).optional(),
});

const ImageTextPayloadSchema = z.object({
  headline: SafeString(200),
  body: SafeString(2000),
  mediaKey: SafeString(300),
  imagePosition: z.enum(["left", "right"]).optional().default("left"),
});

const StatItemSchema = z.object({
  value: SafeString(50),
  label: SafeString(100),
  unit: SafeString(20).optional(),
});

const StatHighlightPayloadSchema = z.object({
  title: SafeString(200).optional(),
  stats: z.array(StatItemSchema).min(1).max(6).optional(),
  items: z
    .array(
      z.object({
        title: SafeString(100),
        description: SafeString(500),
      })
    )
    .min(1)
    .max(6)
    .optional(),
});

const FeaturesGridPayloadSchema = z.object({
  title: SafeString(200).optional(),
  items: z
    .array(
      z.object({
        title: SafeString(100),
        description: SafeString(500),
      })
    )
    .min(1)
    .max(8),
});

const SpecFeaturePayloadSchema = z.object({
  title: SafeString(200),
  description: SafeString(2000),
  mediaKey: SafeString(300).optional(),
  badge: SafeString(50).optional(),
});

const VideoPayloadSchema = z.object({
  videoKey: SafeString(300),
  posterKey: SafeString(300).optional(),
  title: SafeString(200).optional(),
  caption: SafeString(500).optional(),
});

const GalleryItemSchema = z.object({
  mediaKey: SafeString(300),
  altText: SafeString(200).optional(),
  caption: SafeString(300).optional(),
});

const GalleryPayloadSchema = z.object({
  title: SafeString(200).optional(),
  items: z.array(GalleryItemSchema).min(1).max(8),
});

const ComparisonPayloadSchema = z.object({
  title: SafeString(200).optional(),
  headers: z.array(SafeString(100)).min(2).max(6),
  rows: z
    .array(z.array(SafeString(200)).min(2).max(6))
    .min(1)
    .max(20),
});

const DimensionsPayloadSchema = z.object({
  blueprintMediaKey: SafeString(300).optional(),
  lengthMm: z.number().positive().max(1000).optional(),
  widthMm: z.number().positive().max(1000).optional(),
  heightMm: z.number().positive().max(1000).optional(),
  gripTypes: z.array(SafeString(50)).max(10).optional(),
});

const BoxContentsItemSchema = z.object({
  title: SafeString(100),
  mediaKey: SafeString(300).optional(),
  count: z.number().int().min(1).max(100).optional(),
});

const BoxContentsPayloadSchema = z.object({
  title: SafeString(200).optional(),
  items: z.array(BoxContentsItemSchema).min(1).max(12),
});

const TechnicalSpecsGroupSchema = z.object({
  groupName: SafeString(100),
  specs: z
    .array(
      z.object({
        label: SafeString(100),
        value: SafeString(200),
      })
    )
    .min(1)
    .max(20),
});

const TechnicalSpecsPayloadSchema = z.object({
  title: SafeString(200).optional(),
  groups: z.array(TechnicalSpecsGroupSchema).min(1).max(10),
});

const FaqItemSchema = z.object({
  question: SafeString(300),
  answer: SafeString(2000),
});

const FaqPayloadSchema = z.object({
  title: SafeString(200).optional(),
  items: z.array(FaqItemSchema).min(1).max(15),
});

const RelatedProductsPayloadSchema = z.object({
  title: SafeString(200).optional(),
  categorySlugs: z.array(SafeString(100)).max(10).optional(),
  productSlugs: z.array(SafeString(100)).max(10).optional(),
});

export const StoryBlockPayloadSchemas: Record<string, z.ZodTypeAny> = {
  hero_media: HeroMediaPayloadSchema,
  hero: HeroMediaPayloadSchema,
  full_bleed_image: FullBleedImagePayloadSchema,
  image_text: ImageTextPayloadSchema,
  stat_highlight: StatHighlightPayloadSchema,
  features_grid: FeaturesGridPayloadSchema,
  spec_feature: SpecFeaturePayloadSchema,
  video: VideoPayloadSchema,
  gallery: GalleryPayloadSchema,
  comparison: ComparisonPayloadSchema,
  dimensions: DimensionsPayloadSchema,
  box_contents: BoxContentsPayloadSchema,
  technical_specs: TechnicalSpecsPayloadSchema,
  faq: FaqPayloadSchema,
  related_products: RelatedProductsPayloadSchema,
};

const RawStoryBlockEnvelopeSchema = z.object({
  block_id: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  order: z.number().int().min(1).max(1000),
  payload: z.record(z.string(), z.unknown()),
});

export interface ValidatedStoryBlock {
  blockId: string;
  type: string;
  order: number;
  payload: Record<string, unknown>;
}

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

    const payloadSchema = StoryBlockPayloadSchemas[type];
    if (!payloadSchema) {
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

    const payloadResult = payloadSchema.safeParse(payload);
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
      type,
      order,
      payload: payloadResult.data as Record<string, unknown>,
    });
  }

  if (validated.length === 0) {
    return null;
  }

  return validated.sort((a, b) => a.order - b.order);
}
