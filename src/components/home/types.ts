/**
 * Gamer Perú — Homepage Data Model Types
 *
 * ARCHITECTURAL PRINCIPLE:
 * Presentation seed configuration for the Storefront Homepage.
 * Represents structured layout and narrative content.
 * It is NOT commerce database authority.
 */

export type HomeMedia =
  | {
      kind: "abstract";
    }
  | {
      kind: "image";
      src: string;
      mobileSrc?: string;
      altText: string;
      decorative?: boolean;
    };

export interface HomeHeroData {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta: {
    label: string;
    href: string;
  };
  media: HomeMedia;
}

export interface HomeFeaturedEditorialData {
  eyebrow: string;
  title: string;
  description: string;
  cta: {
    label: string;
    href: string;
  };
  media: HomeMedia;
}

export interface HomeCategoryItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  theme: "dark" | "light" | "neutral";
  media: HomeMedia;
}

export interface HomeGearPreviewItem {
  id: string;
  title: string;
  categoryLabel: string;
  href: string;
  media: HomeMedia;
}

export interface HomeTechnicalStat {
  value: string;
  label: string;
  description: string;
}

export interface HomeTechnicalEditorialData {
  eyebrow: string;
  title: string;
  description: string;
  stats: HomeTechnicalStat[];
  cta: {
    label: string;
    href: string;
  };
  media?: HomeMedia;
}

export interface HomeBrandItem {
  name: string;
  slug: string;
  href: string;
}

export interface HomeTrustFact {
  title: string;
  description: string;
}

export interface HomeDiscoveryLinkColumn {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

export interface HomepageData {
  hero: HomeHeroData;
  featuredEditorial: HomeFeaturedEditorialData;
  categories: HomeCategoryItem[];
  curatedGear: {
    eyebrow: string;
    title: string;
    items: HomeGearPreviewItem[];
  };
  technicalEditorial: HomeTechnicalEditorialData;
  brands: {
    eyebrow: string;
    title: string;
    items: HomeBrandItem[];
  };
  discoveryFooter: {
    trustFacts: HomeTrustFact[];
    directoryColumns: HomeDiscoveryLinkColumn[];
  };
}
