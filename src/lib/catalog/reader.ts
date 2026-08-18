import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
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
   * Retrieves and validates the active specification schema for a category.
   */
  getCategorySpecificationSchema(categoryId: string): Promise<ValidatedSpecificationSchema | null>;

  /**
   * Retrieves discovery facets for a category (brand options, technical schema and represented options).
   */
  getCategoryDiscoveryFacets(
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets>;

  /**
   * Retrieves discovery facets for a brand (category options, conditional technical schema and represented options).
   */
  getBrandDiscoveryFacets(
    brandId: string,
    selectedCategorySlug: string | null
  ): Promise<DiscoveryFacets>;

  /**
   * Retrieves paginated published products for a category matching filter state.
   */
  getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;

  /**
   * Retrieves paginated published products for a brand matching filter state.
   */
  getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;
}
