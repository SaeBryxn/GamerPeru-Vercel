import type {
  Product,
  ProductVariant,
  ProductSpecification,
  MediaAsset,
  Brand,
  Category,
  CategorySpecificationSchema,
} from "@/db/schema";

export type CatalogStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type VariantStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  primaryMediaKey: string | null;
  primaryMediaAlt: string | null;
  totalVariants: number;
  activeVariants: number;
  minActivePriceCents: number | null;
  maxActivePriceCents: number | null;
  activeVariantAts: number;
}

/** Readiness gaps an operator can filter the catalog by. */
/**
 * `issues` covers every product the publish validator flags (blockers or warnings) or whose story
 * is not published; it is resolved in application code, see `catalog-health.ts`.
 */
export type AdminProductPendingFilter = "media" | "stock" | "price" | "variants" | "issues";

export interface AdminProductListQuery {
  status?: CatalogStatus | null;
  pending?: AdminProductPendingFilter | null;
  brandId?: string | null;
  categoryId?: string | null;
  search?: string | null;
  /** Restricts the list to these products; how the page applies the `issues` filter. */
  productIds?: readonly string[] | null;
  page?: number;
  pageSize?: number;
}

export interface AdminProductListResult {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminProductDetailVariant extends ProductVariant {
  isSkuImmutable: boolean;
}

export interface AdminProductDetailMedia {
  id: string;
  productId: string;
  mediaAssetId: string;
  variantId: string | null;
  displayOrder: number;
  createdAt: Date;
  mediaAsset: {
    objectKey: string;
    securityClass: string;
    mediaType: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    altText: string | null;
  };
}

export interface AdminProductDetail {
  product: Product;
  brand: Brand;
  category: Category;
  currentSpecSchema: CategorySpecificationSchema | null;
  specifications: ProductSpecification | null;
  variants: AdminProductDetailVariant[];
  media: AdminProductDetailMedia[];
  primaryMedia: MediaAsset | null;
  publishReadiness: PublishReadinessResult;
}

export interface PublishBlocker {
  code: string;
  message: string;
  field?: string;
}

export interface PublishWarning {
  code: string;
  message: string;
  field?: string;
}

export interface PublishReadinessResult {
  isPublishable: boolean;
  blockers: PublishBlocker[];
  warnings: PublishWarning[];
}

export interface BrandReference {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
}

export interface CategoryReference {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  currentSpecSchemaId: string | null;
}

export interface CreateProductInput {
  name: string;
  slug: string;
  brandId: string;
  categoryId: string;
  subtitle?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  initialVariant?: {
    sku: string;
    title: string;
    priceCents: number;
    compareAtPriceCents?: number | null;
    costCents?: number | null;
    weightGrams?: number | null;
    attributes?: Record<string, string>;
  };
  mutationRequestId?: string;
}

export interface UpdateProductInput {
  productId: string;
  expectedUpdatedAt: Date | string;
  name?: string;
  slug?: string;
  brandId?: string;
  categoryId?: string;
  subtitle?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  specValues?: Record<string, unknown> | null;
  mutationRequestId?: string;
}

export interface CreateVariantInput {
  productId: string;
  sku: string;
  title: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  costCents?: number | null;
  weightGrams?: number | null;
  attributes?: Record<string, string>;
  status?: VariantStatus;
  displayOrder?: number;
  mutationRequestId?: string;
}

export interface UpdateVariantInput {
  variantId: string;
  expectedUpdatedAt: Date | string;
  sku?: string;
  title?: string;
  priceCents?: number;
  compareAtPriceCents?: number | null;
  costCents?: number | null;
  weightGrams?: number | null;
  attributes?: Record<string, string>;
  status?: VariantStatus;
  displayOrder?: number;
  mutationRequestId?: string;
}

export interface DuplicateProductInput {
  sourceProductId: string;
  options?: {
    customName?: string;
    customSlug?: string;
  };
  mutationRequestId?: string;
}

export interface StatusTransitionInput {
  productId: string;
  expectedUpdatedAt: Date | string;
  targetStatus: CatalogStatus;
  mutationRequestId?: string;
}

export class CatalogDomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus = 400) {
    super(message);
    this.name = "CatalogDomainError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class CatalogIdempotencyConflictError extends CatalogDomainError {
  constructor(
    message = "El identificador de idempotencia fue reutilizado con una carga diferente."
  ) {
    super(message, "CATALOG_IDEMPOTENCY_CONFLICT", 409);
    this.name = "CatalogIdempotencyConflictError";
  }
}

export class CatalogReplayIntegrityError extends CatalogDomainError {
  constructor(
    message = "El registro de repetición existe pero la entidad destino no es consistente."
  ) {
    super(message, "CATALOG_REPLAY_INTEGRITY_ERROR", 500);
    this.name = "CatalogReplayIntegrityError";
  }
}

export class StaleWriteConflictError extends CatalogDomainError {
  constructor(
    message = "El producto o variante fue modificado por otro proceso. Actualiza la página e inténtalo de nuevo."
  ) {
    super(message, "STALE_WRITE_CONFLICT", 409);
    this.name = "StaleWriteConflictError";
  }
}

export class ProductStatusGuardError extends CatalogDomainError {
  constructor(
    message = "El producto ya no se encuentra en el estado requerido para esta operación."
  ) {
    super(message, "PRODUCT_STATUS_GUARD_FAILED", 409);
    this.name = "ProductStatusGuardError";
  }
}

export class SkuImmutableError extends CatalogDomainError {
  constructor(
    message = "Este SKU está vinculado a registros de inventario o pedidos históricos y no puede modificarse."
  ) {
    super(message, "SKU_IMMUTABLE_ERROR", 422);
    this.name = "SkuImmutableError";
  }
}

export class SpecificationSchemaIntegrityError extends CatalogDomainError {
  constructor(
    message = "El esquema de especificaciones de la categoría no es íntegro, no coincide con la categoría o está inactivo."
  ) {
    super(message, "SPECIFICATION_SCHEMA_INTEGRITY_ERROR", 422);
    this.name = "SpecificationSchemaIntegrityError";
  }
}
