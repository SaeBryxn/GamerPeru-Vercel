import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
} from "./types";

/**
 * Server-only Catalog Discovery Reader Contract
 *
 * Provides a minimal, strictly read-only interface for storefront category
 * and brand discovery pages.
 */
export interface CatalogDiscoveryReader {
  /**
   * Retrieves a published category by its slug.
   * Returns null if the category does not exist or is DRAFT/ARCHIVED.
   */
  getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null>;

  /**
   * Retrieves a published brand by its slug, including safe public logo media.
   * Returns null if the brand does not exist or is DRAFT/ARCHIVED.
   */
  getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null>;

  /**
   * Retrieves paginated published products for a category.
   * Products must have Product=PUBLISHED, Brand=PUBLISHED, Category=PUBLISHED,
   * and at least one ProductVariant=ACTIVE.
   */
  getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;

  /**
   * Retrieves paginated published products for a brand.
   * Products must have Product=PUBLISHED, Brand=PUBLISHED, Category=PUBLISHED,
   * and at least one ProductVariant=ACTIVE.
   */
  getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;
}
