import "server-only";
import type { ProductDiscoveryItem } from "./types";

export interface StoryRelatedProductsReader {
  /**
   * Hydrates published products matching explicit product slugs for Product Story cross-sell.
   *
   * Invariants:
   * 1. Published product only: products.status = 'PUBLISHED'.
   * 2. Published brand only: brands.status = 'PUBLISHED'.
   * 3. Published category only: categories.status = 'PUBLISHED'.
   * 4. Active variant: At least one variant with status = 'ACTIVE'.
   * 5. Excludes current product if excludeProductId is provided.
   * 6. Returns public ProductDiscoveryItem projection only (no cost, inventory, or admin fields).
   */
  getPublishedProductsBySlugs(
    slugs: readonly string[],
    excludeProductId?: string
  ): Promise<ProductDiscoveryItem[]>;
}
