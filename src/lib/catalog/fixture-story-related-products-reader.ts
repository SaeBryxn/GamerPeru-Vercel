import "server-only";
import type { ProductDiscoveryItem } from "./types";
import type { StoryRelatedProductsReader } from "./story-related-products-reader";
import { FIXTURE_PRODUCTS } from "./fixture-reader";

export class FixtureStoryRelatedProductsReader implements StoryRelatedProductsReader {
  async getPublishedProductsBySlugs(
    slugs: readonly string[],
    excludeProductId?: string
  ): Promise<ProductDiscoveryItem[]> {
    if (!slugs || slugs.length === 0) {
      return [];
    }

    const uniqueSlugs = Array.from(new Set(slugs.map((s) => s.trim()).filter(Boolean)));
    if (uniqueSlugs.length === 0) {
      return [];
    }

    const matching = FIXTURE_PRODUCTS.filter(
      (p) => uniqueSlugs.includes(p.slug) && (!excludeProductId || p.id !== excludeProductId)
    );

    return matching.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle,
      brand: p.brand,
      category: p.category,
      primaryMedia: p.primaryMedia,
      startingPriceCents: p.startingPriceCents,
    }));
  }
}
