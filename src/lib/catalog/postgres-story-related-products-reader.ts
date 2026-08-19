import "server-only";
import type { ProductDiscoveryItem } from "./types";
import type { StoryRelatedProductsReader } from "./story-related-products-reader";
import { buildStoryRelatedProductsBySlugsQuery } from "./postgres-story-related-products-queries";

export class PostgresStoryRelatedProductsReader implements StoryRelatedProductsReader {
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

    const rows = await buildStoryRelatedProductsBySlugsQuery(uniqueSlugs, excludeProductId);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: row.subtitle,
      brand: {
        name: row.brandName,
        slug: row.brandSlug,
      },
      category: {
        name: row.categoryName,
        slug: row.categorySlug,
      },
      primaryMedia: row.primaryMediaKey
        ? {
            objectKey: row.primaryMediaKey,
            altText: row.primaryMediaAlt,
            width: row.primaryMediaWidth,
            height: row.primaryMediaHeight,
          }
        : null,
      startingPriceCents: row.startingPriceCents,
    }));
  }
}
