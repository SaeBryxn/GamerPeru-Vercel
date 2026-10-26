"use server";

import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import {
  createProduct,
  updateProduct,
  createVariant,
  updateVariant,
  reorderProductVariants,
  duplicateProduct,
  transitionProductStatus,
  deleteProduct,
} from "./service";
import {
  updateMediaAssetAltText,
  reorderProductMedia,
  detachProductMedia,
  setProductPrimaryMedia,
  reassignProductMediaVariant,
} from "./media-service";
import { parsePenInputToCents } from "./money";
import { mapDomainErrorToUi } from "./error-mapping";
import { type CatalogStatus, type VariantStatus } from "./types";
import type { Product, ProductVariant } from "@/db/schema";

/**
 * Expires the cached storefront after a catalog write, so the edit is visible on the next request
 * instead of after the catalog cache window. Admin pages are not revalidated here: they are
 * dynamic, and revalidating them would re-render the editor inside the action (Error 1102).
 */
function revalidateStorefront() {
  revalidateStorefrontCatalog();
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface CreateProductActionInput {
  name: string;
  slug: string;
  brandId: string;
  categoryId: string;
  subtitle?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  pdpConfig?: Record<string, unknown>;
  initialVariant?: {
    sku: string;
    title: string;
    pricePen: string;
    compareAtPricePen?: string | null;
    costPen?: string | null;
    weightGrams?: number | null;
    attributes?: Record<string, string>;
  };
  mutationRequestId?: string;
}

export interface UpdateProductActionInput {
  productId: string;
  expectedUpdatedAt: string;
  name?: string;
  slug?: string;
  brandId?: string;
  categoryId?: string;
  subtitle?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  specValues?: Record<string, unknown> | null;
  pdpConfig?: Record<string, unknown>;
  mutationRequestId?: string;
}

export interface CreateVariantActionInput {
  productId: string;
  sku: string;
  title: string;
  pricePen: string;
  compareAtPricePen?: string | null;
  costPen?: string | null;
  weightGrams?: number | null;
  attributes?: Record<string, string>;
  status?: VariantStatus;
  displayOrder?: number;
  mutationRequestId?: string;
}

/**
 * Server Action: Sets the order of a product's variants; the first is the storefront default.
 */
export async function reorderProductVariantsAction(input: {
  productId: string;
  orderedVariantIds: string[];
}): Promise<ActionResult<null>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    await reorderProductVariants(input, { authContext });
    revalidateStorefront();
    return { success: true, data: null };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface UpdateVariantActionInput {
  productId: string;
  variantId: string;
  expectedUpdatedAt: string;
  sku?: string;
  title?: string;
  pricePen?: string;
  compareAtPricePen?: string | null;
  costPen?: string | null;
  weightGrams?: number | null;
  attributes?: Record<string, string>;
  status?: VariantStatus;
  displayOrder?: number;
  mutationRequestId?: string;
}

export interface DuplicateProductActionInput {
  sourceProductId: string;
  options?: {
    customName?: string;
    customSlug?: string;
  };
  mutationRequestId?: string;
}

export interface TransitionProductStatusActionInput {
  productId: string;
  expectedUpdatedAt: string;
  targetStatus: CatalogStatus;
  mutationRequestId?: string;
}

/**
 * Server Action: Create Product with optional initial Variant.
 */
export async function createProductAction(
  input: CreateProductActionInput
): Promise<ActionResult<{ product: Product }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    let initialVariantParsed:
      | {
          sku: string;
          title: string;
          priceCents: number;
          compareAtPriceCents?: number | null;
          costCents?: number | null;
          weightGrams?: number | null;
          attributes?: Record<string, string>;
        }
      | undefined;

    if (input.initialVariant) {
      const priceRes = parsePenInputToCents(input.initialVariant.pricePen, "price_cents");
      if (!priceRes.success) {
        return { success: false, error: priceRes.error, code: priceRes.code };
      }

      let compareAtPriceCents: number | null = null;
      if (
        input.initialVariant.compareAtPricePen !== undefined &&
        input.initialVariant.compareAtPricePen !== null &&
        input.initialVariant.compareAtPricePen.trim() !== ""
      ) {
        const compRes = parsePenInputToCents(
          input.initialVariant.compareAtPricePen,
          "compare_at_price_cents"
        );
        if (!compRes.success) {
          return { success: false, error: compRes.error, code: compRes.code };
        }
        compareAtPriceCents = compRes.cents;
      }

      let costCents: number | null = null;
      if (
        input.initialVariant.costPen !== undefined &&
        input.initialVariant.costPen !== null &&
        input.initialVariant.costPen.trim() !== ""
      ) {
        const costRes = parsePenInputToCents(input.initialVariant.costPen, "cost_cents");
        if (!costRes.success) {
          return { success: false, error: costRes.error, code: costRes.code };
        }
        costCents = costRes.cents;
      }

      initialVariantParsed = {
        sku: input.initialVariant.sku,
        title: input.initialVariant.title,
        priceCents: priceRes.cents!,
        compareAtPriceCents,
        costCents,
        weightGrams: input.initialVariant.weightGrams ?? null,
        attributes: input.initialVariant.attributes,
      };
    }

    const product = await createProduct(
      {
        name: input.name,
        slug: input.slug,
        brandId: input.brandId,
        categoryId: input.categoryId,
        subtitle: input.subtitle,
        description: input.description,
        isFeatured: input.isFeatured,
        pdpConfig: input.pdpConfig,
        initialVariant: initialVariantParsed,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { product } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

/**
 * Server Action: Update Product details and/or specification values.
 */
export async function updateProductAction(
  input: UpdateProductActionInput
): Promise<ActionResult<{ product: Product }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    const product = await updateProduct(
      {
        productId: input.productId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        name: input.name,
        slug: input.slug,
        brandId: input.brandId,
        categoryId: input.categoryId,
        subtitle: input.subtitle,
        description: input.description,
        isFeatured: input.isFeatured,
        specValues: input.specValues,
        pdpConfig: input.pdpConfig,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { product } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

/**
 * Server Action: Create a new Variant for an existing Product.
 */
export async function createVariantAction(
  input: CreateVariantActionInput
): Promise<ActionResult<{ variant: ProductVariant }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    const priceRes = parsePenInputToCents(input.pricePen, "price_cents");
    if (!priceRes.success) {
      return { success: false, error: priceRes.error, code: priceRes.code };
    }

    let compareAtPriceCents: number | null = null;
    if (
      input.compareAtPricePen !== undefined &&
      input.compareAtPricePen !== null &&
      input.compareAtPricePen.trim() !== ""
    ) {
      const compRes = parsePenInputToCents(input.compareAtPricePen, "compare_at_price_cents");
      if (!compRes.success) {
        return { success: false, error: compRes.error, code: compRes.code };
      }
      compareAtPriceCents = compRes.cents;
    }

    let costCents: number | null = null;
    if (input.costPen !== undefined && input.costPen !== null && input.costPen.trim() !== "") {
      const costRes = parsePenInputToCents(input.costPen, "cost_cents");
      if (!costRes.success) {
        return { success: false, error: costRes.error, code: costRes.code };
      }
      costCents = costRes.cents;
    }

    const variant = await createVariant(
      {
        productId: input.productId,
        sku: input.sku,
        title: input.title,
        priceCents: priceRes.cents!,
        compareAtPriceCents,
        costCents,
        weightGrams: input.weightGrams ?? null,
        attributes: input.attributes,
        status: input.status,
        displayOrder: input.displayOrder,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { variant } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

/**
 * Server Action: Update an existing Variant.
 */
export async function updateVariantAction(
  input: UpdateVariantActionInput
): Promise<ActionResult<{ variant: ProductVariant }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    let priceCents: number | undefined;
    if (input.pricePen !== undefined) {
      const priceRes = parsePenInputToCents(input.pricePen, "price_cents");
      if (!priceRes.success) {
        return { success: false, error: priceRes.error, code: priceRes.code };
      }
      priceCents = priceRes.cents!;
    }

    let compareAtPriceCents: number | null | undefined;
    if (input.compareAtPricePen !== undefined) {
      if (input.compareAtPricePen === null || input.compareAtPricePen.trim() === "") {
        compareAtPriceCents = null;
      } else {
        const compRes = parsePenInputToCents(input.compareAtPricePen, "compare_at_price_cents");
        if (!compRes.success) {
          return { success: false, error: compRes.error, code: compRes.code };
        }
        compareAtPriceCents = compRes.cents;
      }
    }

    let costCents: number | null | undefined;
    if (input.costPen !== undefined) {
      if (input.costPen === null || input.costPen.trim() === "") {
        costCents = null;
      } else {
        const costRes = parsePenInputToCents(input.costPen, "cost_cents");
        if (!costRes.success) {
          return { success: false, error: costRes.error, code: costRes.code };
        }
        costCents = costRes.cents;
      }
    }

    const variant = await updateVariant(
      {
        variantId: input.variantId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        sku: input.sku,
        title: input.title,
        priceCents,
        compareAtPriceCents,
        costCents,
        weightGrams: input.weightGrams,
        attributes: input.attributes,
        status: input.status,
        displayOrder: input.displayOrder,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { variant } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

/**
 * Server Action: Duplicate Product with deep variant copying.
 */
export async function duplicateProductAction(
  input: DuplicateProductActionInput
): Promise<ActionResult<{ product: Product }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }

  try {
    const product = await duplicateProduct(
      {
        sourceProductId: input.sourceProductId,
        options: input.options,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { product } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

/**
 * Server Action: Transition Product lifecycle status.
 *
 * In accordance with Amendment 1:
 * transitionProductStatus() is the authoritative domain boundary and derives
 * catalog:manage vs catalog:publish internally under database row lock.
 * This action passes the verified authContext and maps domain errors cleanly.
 */
export async function transitionProductStatusAction(
  input: TransitionProductStatusActionInput
): Promise<ActionResult<{ product: Product }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  try {
    const product = await transitionProductStatus(
      {
        productId: input.productId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        targetStatus: input.targetStatus,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: { product } };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface DeleteProductActionInput {
  productId: string;
  expectedUpdatedAt: string;
}

/**
 * Server Action: permanently delete a product that was never ordered. The service decides the
 * permission (publish for a live product) and refuses products with order history.
 */
export async function deleteProductAction(
  input: DeleteProductActionInput
): Promise<ActionResult<{ productId: string; name: string }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  try {
    const result = await deleteProduct(
      { productId: input.productId, expectedUpdatedAt: input.expectedUpdatedAt },
      { authContext }
    );
    revalidateStorefront();
    return { success: true, data: result };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface UpdateMediaAltTextActionInput {
  productId: string;
  mediaAssetId: string;
  altText: string | null;
  mutationRequestId: string;
}

/**
 * Server Action: Update alt text on a MediaAsset globally across all references.
 */
export async function updateMediaAltTextAction(
  input: UpdateMediaAltTextActionInput
): Promise<ActionResult<{ mediaAssetId: string; altText: string | null; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
      code: "FORBIDDEN",
    };
  }

  try {
    const result = await updateMediaAssetAltText(
      {
        productId: input.productId,
        mediaAssetId: input.mediaAssetId,
        altText: input.altText,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return {
      success: true,
      data: {
        mediaAssetId: result.mediaAsset.id,
        altText: result.mediaAsset.altText,
        replayed: result.replayed,
      },
    };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface ReorderProductMediaActionInput {
  productId: string;
  orderedProductMediaIds: string[];
  mutationRequestId: string;
}

/**
 * Server Action: Reorder ProductMedia gallery items for a Product.
 */
export async function reorderProductMediaAction(
  input: ReorderProductMediaActionInput
): Promise<ActionResult<{ success: boolean; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
      code: "FORBIDDEN",
    };
  }

  try {
    const result = await reorderProductMedia(
      {
        productId: input.productId,
        orderedProductMediaIds: input.orderedProductMediaIds,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: result };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface DetachProductMediaActionInput {
  productId: string;
  productMediaId: string;
  mutationRequestId: string;
}

export async function detachProductMediaAction(
  input: DetachProductMediaActionInput
): Promise<ActionResult<{ success: boolean; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
      code: "FORBIDDEN",
    };
  }

  try {
    const result = await detachProductMedia(
      {
        productId: input.productId,
        productMediaId: input.productMediaId,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return { success: true, data: result };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface SetPrimaryMediaActionInput {
  productId: string;
  productMediaId: string;
  expectedUpdatedAt: string;
  mutationRequestId: string;
}

/**
 * Server Action: Set a GLOBAL ProductMedia item as the primary media for a Product.
 */
export async function setPrimaryMediaAction(
  input: SetPrimaryMediaActionInput
): Promise<ActionResult<{ primaryMediaId: string; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
      code: "FORBIDDEN",
    };
  }

  try {
    const result = await setProductPrimaryMedia(
      {
        productId: input.productId,
        productMediaId: input.productMediaId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return {
      success: true,
      data: {
        primaryMediaId: result.primaryMediaId,
        replayed: result.replayed,
      },
    };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}

export interface ReassignProductMediaVariantActionInput {
  productId: string;
  productMediaId: string;
  targetVariantId: string | null;
  mutationRequestId: string;
}

/**
 * Server Action: Reassign a ProductMedia item to a variant (or to global).
 */
export async function reassignProductMediaVariantAction(
  input: ReassignProductMediaVariantActionInput
): Promise<ActionResult<{ productMediaId: string; variantId: string | null; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes los permisos necesarios para gestionar medios del catálogo.",
      code: "FORBIDDEN",
    };
  }

  try {
    const result = await reassignProductMediaVariant(
      {
        productId: input.productId,
        productMediaId: input.productMediaId,
        targetVariantId: input.targetVariantId,
        mutationRequestId: input.mutationRequestId,
      },
      { authContext }
    );

    revalidateStorefront();

    return {
      success: true,
      data: {
        productMediaId: result.productMedia.id,
        variantId: result.productMedia.variantId,
        replayed: result.replayed,
      },
    };
  } catch (err) {
    const uiError = mapDomainErrorToUi(err);
    return { success: false, ...uiError };
  }
}
