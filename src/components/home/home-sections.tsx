import "server-only";
import React from "react";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import type { StorefrontHome } from "@/lib/home/read-home-sections";
import type {
  HomeImageSlot,
  HomeSection,
  HomeVideoSourceContent,
} from "@/lib/home/section-schemas";
import type { HomeVideoSource } from "./home-video";
import { BentoShowcase } from "./bento-showcase/bento-showcase";
import { BrandStrip } from "./brand-strip/brand-strip";
import { CatalogRail } from "./catalog-rail/catalog-rail";
import { CommunityBanner } from "./community-banner/community-banner";
import { CompareSlider } from "./compare-slider/compare-slider";
import { FeatureVideo } from "./feature-video/feature-video";
import { getCachedStoryRelatedProducts } from "@/lib/catalog/cached-queries";
import { selectProducts } from "@/lib/catalog/curated-products";
import { loadRailProducts, loadShowcaseBrands, loadShowcaseProducts } from "./home-catalog";
import { ProductCarousel } from "./product-carousel/product-carousel";
import { SplitShowcase } from "./split-showcase/split-showcase";
import { TrustStrip } from "./trust-strip/trust-strip";
import { VideoHero } from "./video-hero/video-hero";

async function loadSectionProducts(section: HomeSection): Promise<ProductDiscoveryItem[]> {
  if (
    (section.type === "product_carousel" || section.type === "catalog_rail") &&
    section.content.selection?.mode === "manual"
  ) {
    const selection = section.content.selection;
    const items = await getCachedStoryRelatedProducts(selection.productSlugs);
    const categorySlug =
      section.type === "catalog_rail"
        ? section.content.categorySlug
        : section.content.source.kind === "category"
          ? section.content.source.categorySlug
          : undefined;
    const scoped = categorySlug
      ? items.filter((item) => item.category.slug === categorySlug)
      : items;
    return selectProducts(scoped, selection).slice(0, section.content.maxItems);
  }
  if (section.type === "product_carousel") {
    const { source, maxItems } = section.content;
    return source.kind === "showcase"
      ? loadShowcaseProducts(maxItems)
      : loadRailProducts(source.categorySlug, maxItems);
  }
  if (section.type === "catalog_rail") {
    return loadRailProducts(section.content.categorySlug, section.content.maxItems);
  }
  return [];
}

/** Anchor ids stay stable for links like `/#mouses`; repeated sections get a numeric suffix. */
function createAnchorAllocator(): (base: string) => string {
  const used = new Map<string, number>();
  return (base) => {
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

export interface HomeSectionsProps {
  home: StorefrontHome;
  /** Wraps every section after the hero: the layer that scrolls over the pinned stage. */
  storeLayerClassName?: string;
}

/**
 * Renders the operator-managed home. Catalog sections only carry a source: their products,
 * prices and stock are read from the catalog here, never from the stored section.
 */
export async function HomeSections({ home, storeLayerClassName }: HomeSectionsProps) {
  const { sections, mediaUrls } = home;
  const [products, brands] = await Promise.all([
    Promise.all(sections.map(loadSectionProducts)),
    loadShowcaseBrands(),
  ]);
  const image = (slot: HomeImageSlot) => ({
    src: slot.mediaAssetId ? (mediaUrls[slot.mediaAssetId] ?? null) : null,
    alt: slot.alt,
  });
  const url = (assetId: string) => mediaUrls[assetId] ?? null;
  const video = (source: HomeVideoSourceContent): HomeVideoSource =>
    source.kind === "youtube"
      ? source
      : { kind: "upload", src: url(source.videoAssetId), posterSrc: url(source.posterAssetId) };
  const anchor = createAnchorAllocator();
  const storeLayerId = "tienda";

  const hero = sections[0]?.type === "video_hero" ? sections[0] : null;
  const rest = hero ? sections.slice(1) : sections;
  const offset = hero ? 1 : 0;

  return (
    <>
      {hero && (
        <VideoHero
          heading={hero.content.heading}
          scrollHintLabel={hero.content.scrollHintLabel}
          video={video(hero.content.video)}
          twitch={hero.content.twitch}
          revealTargetId={storeLayerId}
        />
      )}

      <div id={storeLayerId} className={storeLayerClassName}>
        {rest.map((section, index) => {
          const sectionProducts = products[index + offset] ?? [];
          // The brand strip follows the first section, right where the store begins.
          const brandStrip =
            !home.hasBrandSection && index === 0 ? <BrandStrip brands={brands} /> : null;
          const rendered = renderSection(section, sectionProducts);
          return brandStrip ? (
            <React.Fragment key={section.id}>
              {rendered}
              {brandStrip}
            </React.Fragment>
          ) : (
            rendered
          );
        })}
        {!home.hasBrandSection && rest.length === 0 && <BrandStrip brands={brands} />}
      </div>
    </>
  );

  function renderSection(section: HomeSection, sectionProducts: ProductDiscoveryItem[]) {
    switch (section.type) {
      case "brand_strip":
        return (
          <BrandStrip
            key={section.id}
            id={`brands-${section.id}`}
            title={section.content.title}
            items={section.content.items.map((item, index) => ({
              id: `${section.id}-${index}`,
              name: item.name,
              href: item.href,
              logoUrl: image(item.image).src,
            }))}
          />
        );
      case "video_hero":
        return null;
      case "product_carousel":
        return (
          <ProductCarousel
            key={section.id}
            id={anchor("coleccion")}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            products={sectionProducts}
          />
        );
      case "feature_video":
        return (
          <FeatureVideo
            key={section.id}
            video={video(section.content.video)}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            subtitle={section.content.subtitle}
            cta={section.content.cta}
          />
        );
      case "split_showcase":
        return (
          <SplitShowcase
            key={section.id}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            features={section.content.features}
            image={image(section.content.image)}
          />
        );
      case "compare_slider":
        return (
          <CompareSlider
            key={section.id}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            left={{ ...section.content.left, image: image(section.content.left.image) }}
            right={{ ...section.content.right, image: image(section.content.right.image) }}
          />
        );
      case "catalog_rail":
        return (
          <CatalogRail
            key={section.id}
            id={anchor(section.content.categorySlug)}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            products={sectionProducts}
            seeAll={{
              label: section.content.seeAllLabel,
              href: `/categorias/${section.content.categorySlug}`,
            }}
          />
        );
      case "bento_showcase": {
        const [wide, square, tall] = section.content.images;
        return (
          <BentoShowcase
            key={section.id}
            title={section.content.title}
            description={section.content.description}
            images={[image(wide), image(square), image(tall)]}
          />
        );
      }
      case "community_banner":
        return (
          <CommunityBanner
            key={section.id}
            eyebrow={section.content.eyebrow}
            title={section.content.title}
            description={section.content.description}
            ctaLabel={section.content.ctaLabel}
            ctaHref={section.content.ctaHref}
            background={image(section.content.background)}
          />
        );
      case "trust_strip":
        return <TrustStrip key={section.id} items={section.content.items} />;
    }
  }
}
