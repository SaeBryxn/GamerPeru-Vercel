import type { FaqGroup } from "@/content/support/faq";

/**
 * A choice inside a criterion, expressed as the category's own public filter parameters, e.g.
 * `{ peso_max: "55" }` or `{ formato: ["60", "65"] }`. The page validates it against the live
 * specification schema and counts matching products before linking to it.
 */
export interface GuideOption {
  id: string;
  label: string;
  description: string;
  filter: Record<string, string | string[]>;
}

export interface GuideCriterion {
  id: string;
  title: string;
  /** Why the criterion matters, one or two short paragraphs. */
  why: string[];
  options: GuideOption[];
}

export interface GuideProfile {
  title: string;
  text: string;
}

export interface BuyingGuide {
  slug: string;
  /** Category whose catalog the options filter. */
  categorySlug: string;
  /** Short noun used in counts and calls to action, e.g. "mouses". */
  productNoun: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  criteria: GuideCriterion[];
  profiles: GuideProfile[];
  faq: FaqGroup;
}
