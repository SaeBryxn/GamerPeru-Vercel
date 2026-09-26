import type {
  BrandDiscoveryEntity,
  CategoryDiscoveryEntity,
  CategoryFacetOption,
  DiscoveryFacets,
  DiscoveryFilterState,
  PaginatedResult,
  PaginationOptions,
  ProductDiscoveryItem,
  ValidatedSpecificationSchema,
} from "./types";

export interface CatalogDiscoveryReader {
  getPublishedCategoryBySlug(slug: string): Promise<CategoryDiscoveryEntity | null>;
  getPublishedBrandBySlug(slug: string): Promise<BrandDiscoveryEntity | null>;
  getCategorySpecificationSchema(categoryId: string): Promise<ValidatedSpecificationSchema | null>;
  getCategoryDiscoveryFacets(
    categoryId: string,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets>;
  getBrandCategoryFacetOptions(brandId: string): Promise<CategoryFacetOption[]>;
  getBrandDiscoveryFacets(
    brandId: string,
    baseCategories: CategoryFacetOption[],
    selectedCategoryId: string | null,
    schema: ValidatedSpecificationSchema | null
  ): Promise<DiscoveryFacets>;
  getPublishedProductsByCategory(
    categoryId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;
  /** Published products across every category, featured first; used by the home showcase. */
  getShowcaseProducts(limit: number): Promise<ProductDiscoveryItem[]>;
  getPublishedProductsByBrand(
    brandId: string,
    pagination: PaginationOptions,
    filterState?: DiscoveryFilterState,
    schema?: ValidatedSpecificationSchema | null
  ): Promise<PaginatedResult<ProductDiscoveryItem>>;
}

export type { ProductDetailReader } from "./product-detail-reader";
export { getCatalogReader, getProductDetailReader } from "./get-reader";
