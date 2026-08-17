import type { Metadata } from "next";
import {
  BrandDiscovery,
  CategoryShowcase,
  CuratedGear,
  FeaturedEditorial,
  HomeDiscoveryFooter,
  HomeHero,
  HOMEPAGE_DATA,
  TechnicalEditorial,
} from "@/components/home";

export const metadata: Metadata = {
  title: "Gamer Perú | Periféricos Gaming de Alto Rendimiento",
  description:
    "Tienda boutique multimarca de periféricos gaming en Perú. Mouses ultraligeros, teclados magnéticos Rapid Trigger, mousepads y accesorios competitivos.",
};

/**
 * Storefront Homepage — GP-010 Canonical Implementation
 *
 * Visual Role & Rhythm:
 * 1. Cinematic Hero (Dominant / Dark #09090B)
 * 2. Featured Editorial (Major / Light #FFFFFF)
 * 3. Category Visual Doors (Major / Light + Neutral/Dark stages)
 * 4. Curated Gear Shelf (Medium / Light #FFFFFF)
 * 5. Technical Editorial (Dominant / Dark #09090B)
 * 6. Multi-Brand Discovery (Medium / Light #FFFFFF)
 * 7. Compact Local Trust + SEO Directory (Compact / Subtle #F4F4F5)
 *
 * Landmark Architecture:
 * - Owns <main id="main-content"> (preserves SkipLink target from GP-009).
 * - 100% React Server Component composition.
 */
export default function HomePage() {
  return (
    <main id="main-content">
      {/* 1. Cinematic Hero */}
      <HomeHero hero={HOMEPAGE_DATA.hero} />

      {/* 2. Featured Editorial */}
      <FeaturedEditorial data={HOMEPAGE_DATA.featuredEditorial} />

      {/* 3. Category Visual Doors */}
      <CategoryShowcase categories={HOMEPAGE_DATA.categories} />

      {/* 4. Curated Gear Shelf */}
      <CuratedGear
        eyebrow={HOMEPAGE_DATA.curatedGear.eyebrow}
        title={HOMEPAGE_DATA.curatedGear.title}
        items={HOMEPAGE_DATA.curatedGear.items}
      />

      {/* 5. Technical Editorial */}
      <TechnicalEditorial data={HOMEPAGE_DATA.technicalEditorial} />

      {/* 6. Multi-Brand Discovery */}
      <BrandDiscovery
        eyebrow={HOMEPAGE_DATA.brands.eyebrow}
        title={HOMEPAGE_DATA.brands.title}
        items={HOMEPAGE_DATA.brands.items}
      />

      {/* 7. Compact Local Trust + SEO Directory */}
      <HomeDiscoveryFooter
        trustFacts={HOMEPAGE_DATA.discoveryFooter.trustFacts}
        directoryColumns={HOMEPAGE_DATA.discoveryFooter.directoryColumns}
      />
    </main>
  );
}
