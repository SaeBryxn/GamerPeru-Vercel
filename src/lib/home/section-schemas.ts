import { z } from "zod";
import { SafeString } from "@/lib/catalog/story-validation";
import type { HomeSectionType } from "@/db/schema";

export const HOME_CONTENT_SCHEMA_VERSION = 1;

const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const INTERNAL_PATH_REGEX = /^\/(?!\/)[^\s\\]*$/;

/** External destinations a home CTA may point to: community and support channels only. */
export const HOME_EXTERNAL_LINK_HOSTS = [
  "discord.gg",
  "discord.com",
  "wa.me",
  "api.whatsapp.com",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "x.com",
  "facebook.com",
  "www.facebook.com",
] as const;

function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (HOME_EXTERNAL_LINK_HOSTS as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const InternalHref = z
  .string()
  .max(300)
  .regex(INTERNAL_PATH_REGEX, "Debe ser una ruta interna que empiece con /");

const ExternalHref = z
  .string()
  .max(300)
  .refine(isAllowedExternalUrl, "Debe ser un enlace https a un canal permitido");

const CategorySlug = z.string().max(100).regex(CATEGORY_SLUG_REGEX);

/** An image slot: the asset may be missing until the operator uploads one; alt text never is. */
export const HomeImageSlotSchema = z
  .object({
    mediaAssetId: z.string().uuid().nullable(),
    alt: SafeString(1, 200),
  })
  .strict();

export const HomeVideoSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("youtube"), videoId: z.string().regex(YOUTUBE_ID_REGEX) }).strict(),
]);

export const VideoHeroContentSchema = z
  .object({
    heading: SafeString(1, 120),
    scrollHintLabel: SafeString(1, 60),
    video: HomeVideoSourceSchema,
  })
  .strict();

export const ProductCarouselContentSchema = z
  .object({
    eyebrow: SafeString(1, 60),
    title: SafeString(1, 120),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("showcase") }).strict(),
      z.object({ kind: z.literal("category"), categorySlug: CategorySlug }).strict(),
    ]),
    maxItems: z.number().int().min(4).max(24),
  })
  .strict();

export const FeatureVideoContentSchema = z
  .object({
    eyebrow: SafeString(1, 60),
    title: SafeString(1, 80),
    subtitle: SafeString(1, 200),
    cta: z.object({ label: SafeString(1, 40), href: InternalHref }).strict(),
    video: HomeVideoSourceSchema,
  })
  .strict();

export const SplitShowcaseContentSchema = z
  .object({
    eyebrow: SafeString(1, 80),
    title: SafeString(1, 120),
    features: z
      .array(z.object({ title: SafeString(1, 60), description: SafeString(1, 200) }).strict())
      .min(1)
      .max(4),
    image: HomeImageSlotSchema,
  })
  .strict();

const CompareSideSchema = z
  .object({
    kicker: SafeString(1, 40),
    name: SafeString(1, 40),
    image: HomeImageSlotSchema,
  })
  .strict();

export const CompareSliderContentSchema = z
  .object({
    eyebrow: SafeString(1, 80),
    title: SafeString(1, 120),
    left: CompareSideSchema,
    right: CompareSideSchema,
  })
  .strict();

export const CatalogRailContentSchema = z
  .object({
    eyebrow: SafeString(1, 60),
    title: SafeString(1, 120),
    categorySlug: CategorySlug,
    seeAllLabel: SafeString(1, 40),
    maxItems: z.number().int().min(4).max(24),
  })
  .strict();

const TwoLineTitle = z.tuple([SafeString(1, 60), SafeString(1, 60)]);

export const BentoShowcaseContentSchema = z
  .object({
    title: TwoLineTitle,
    description: SafeString(1, 300),
    images: z.tuple([HomeImageSlotSchema, HomeImageSlotSchema, HomeImageSlotSchema]),
  })
  .strict();

export const CommunityBannerContentSchema = z
  .object({
    eyebrow: SafeString(1, 60),
    title: TwoLineTitle,
    description: SafeString(1, 300),
    ctaLabel: SafeString(1, 40),
    ctaHref: ExternalHref.nullable(),
    background: HomeImageSlotSchema,
  })
  .strict();

export const TRUST_STRIP_ICONS = [
  "whatsapp",
  "payment",
  "currency",
  "catalog",
  "shipping",
] as const;

export const TrustStripContentSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            icon: z.enum(TRUST_STRIP_ICONS),
            title: SafeString(1, 60),
            description: SafeString(1, 160),
          })
          .strict()
      )
      .min(1)
      .max(4),
  })
  .strict();

export const HOME_SECTION_CONTENT_SCHEMAS = {
  video_hero: VideoHeroContentSchema,
  product_carousel: ProductCarouselContentSchema,
  feature_video: FeatureVideoContentSchema,
  split_showcase: SplitShowcaseContentSchema,
  compare_slider: CompareSliderContentSchema,
  catalog_rail: CatalogRailContentSchema,
  bento_showcase: BentoShowcaseContentSchema,
  community_banner: CommunityBannerContentSchema,
  trust_strip: TrustStripContentSchema,
} as const satisfies Record<HomeSectionType, z.ZodTypeAny>;

export type HomeSectionContentMap = {
  [K in HomeSectionType]: z.infer<(typeof HOME_SECTION_CONTENT_SCHEMAS)[K]>;
};

/** A section whose content has been validated for its type. */
export type HomeSection = {
  [K in HomeSectionType]: {
    id: string;
    type: K;
    displayOrder: number;
    isVisible: boolean;
    content: HomeSectionContentMap[K];
  };
}[HomeSectionType];

export type HomeImageSlot = z.infer<typeof HomeImageSlotSchema>;

export function parseHomeSectionContent<K extends HomeSectionType>(
  type: K,
  content: unknown
): z.SafeParseReturnType<unknown, HomeSectionContentMap[K]> {
  return HOME_SECTION_CONTENT_SCHEMAS[type].safeParse(content) as z.SafeParseReturnType<
    unknown,
    HomeSectionContentMap[K]
  >;
}

/**
 * Every media slot a section's content references, keyed by the slot name stored in
 * `home_section_media`. Empty slots are omitted.
 */
export function listHomeSectionMediaSlots(section: HomeSection): Map<string, string> {
  const slots = new Map<string, string>();
  const add = (slot: string, image: HomeImageSlot) => {
    if (image.mediaAssetId) slots.set(slot, image.mediaAssetId);
  };

  switch (section.type) {
    case "split_showcase":
      add("image", section.content.image);
      break;
    case "compare_slider":
      add("left.image", section.content.left.image);
      add("right.image", section.content.right.image);
      break;
    case "bento_showcase":
      section.content.images.forEach((image, index) => add(`images.${index}`, image));
      break;
    case "community_banner":
      add("background", section.content.background);
      break;
    default:
      break;
  }
  return slots;
}
