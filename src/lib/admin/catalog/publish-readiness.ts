import type {
  Product,
  ProductVariant,
  ProductSpecification,
  ProductMedia,
  MediaAsset,
  Brand,
  Category,
  CategorySpecificationSchema,
} from "@/db/schema";
import type { PublishBlocker, PublishWarning, PublishReadinessResult } from "./types";
import { validateProductSpecificationValues } from "./specifications";

export const PRODUCT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/webp", "image/png", "image/jpeg"];

export interface PublishReadinessInput {
  product: Product;
  brand: Brand | null;
  category: Category | null;
  currentSpecSchema?: CategorySpecificationSchema | null;
  specifications?: ProductSpecification | null;
  variants: ProductVariant[];
  media: (ProductMedia & { mediaAsset?: MediaAsset | null })[];
  primaryMediaAsset?: MediaAsset | null;
}

/**
 * Authoritative server-side Publish Readiness Validator.
 * Evaluates all hard blockers and soft warnings for transitioning a product to PUBLISHED.
 */
export function evaluatePublishReadiness(input: PublishReadinessInput): PublishReadinessResult {
  const blockers: PublishBlocker[] = [];
  const warnings: PublishWarning[] = [];

  const {
    product,
    brand,
    category,
    currentSpecSchema,
    specifications,
    variants,
    media,
    primaryMediaAsset,
  } = input;

  // 1. Product Name
  const trimmedName = product.name?.trim() ?? "";
  if (!trimmedName) {
    blockers.push({
      code: "PRODUCT_NAME_REQUIRED",
      message: "El nombre del producto es obligatorio.",
      field: "name",
    });
  } else if (trimmedName.length > 200) {
    blockers.push({
      code: "PRODUCT_NAME_TOO_LONG",
      message: "El nombre del producto no puede exceder los 200 caracteres.",
      field: "name",
    });
  }

  // 2. Product Slug
  const trimmedSlug = product.slug?.trim() ?? "";
  if (!trimmedSlug) {
    blockers.push({
      code: "PRODUCT_SLUG_REQUIRED",
      message: "El slug del producto es obligatorio.",
      field: "slug",
    });
  } else if (!PRODUCT_SLUG_REGEX.test(trimmedSlug)) {
    blockers.push({
      code: "PRODUCT_SLUG_INVALID_FORMAT",
      message: "El slug solo puede contener letras minúsculas, números y guiones sencillos.",
      field: "slug",
    });
  } else if (trimmedSlug.length > 200) {
    blockers.push({
      code: "PRODUCT_SLUG_TOO_LONG",
      message: "El slug no puede exceder los 200 caracteres.",
      field: "slug",
    });
  }

  // 3. Brand Verification
  if (!brand) {
    blockers.push({
      code: "BRAND_NOT_FOUND",
      message: "La marca seleccionada no existe.",
      field: "brandId",
    });
  } else if (brand.status !== "PUBLISHED") {
    blockers.push({
      code: "BRAND_NOT_PUBLISHED",
      message: "La marca asignada no está publicada.",
      field: "brandId",
    });
  }

  // 4. Category Verification
  if (!category) {
    blockers.push({
      code: "CATEGORY_NOT_FOUND",
      message: "La categoría seleccionada no existe.",
      field: "categoryId",
    });
  } else if (category.status !== "PUBLISHED") {
    blockers.push({
      code: "CATEGORY_NOT_PUBLISHED",
      message: "La categoría asignada no está publicada.",
      field: "categoryId",
    });
  }

  // 5. Variants Verification
  const activeVariants = variants.filter((v) => v.status === "ACTIVE");
  if (activeVariants.length === 0) {
    blockers.push({
      code: "NO_ACTIVE_VARIANTS",
      message: "El producto debe tener al menos una variante con estado ACTIVO para publicarse.",
      field: "variants",
    });
  } else {
    for (const v of activeVariants) {
      const trimmedSku = v.sku?.trim() ?? "";
      if (!trimmedSku || trimmedSku.length > 50) {
        blockers.push({
          code: "VARIANT_SKU_INVALID",
          message: `La variante "${v.title}" tiene un SKU inválido (debe tener entre 1 y 50 caracteres).`,
          field: `variant_${v.id}_sku`,
        });
      }

      if (!v.priceCents || v.priceCents <= 0) {
        blockers.push({
          code: "VARIANT_PRICE_INVALID",
          message: `La variante "${v.title}" debe tener un precio de venta mayor a 0.`,
          field: `variant_${v.id}_price`,
        });
      }

      if (
        typeof v.attributes !== "object" ||
        v.attributes === null ||
        Array.isArray(v.attributes)
      ) {
        blockers.push({
          code: "VARIANT_ATTRIBUTES_INVALID",
          message: `La variante "${v.title}" tiene atributos con formato inválido.`,
          field: `variant_${v.id}_attributes`,
        });
      }
    }
  }

  // 6. Category Specifications Verification
  if (category && category.currentSpecSchemaId) {
    if (!currentSpecSchema || !currentSpecSchema.isActive) {
      blockers.push({
        code: "SPECIFICATION_SCHEMA_INACTIVE",
        message: "El esquema de especificaciones de la categoría no está activo o no existe.",
        field: "specifications",
      });
    } else {
      if (!specifications) {
        blockers.push({
          code: "PRODUCT_SPECIFICATIONS_MISSING",
          message:
            "El producto requiere registrar especificaciones técnicas según el esquema de la categoría.",
          field: "specifications",
        });
      } else {
        if (specifications.schemaId !== category.currentSpecSchemaId) {
          blockers.push({
            code: "SPECIFICATION_SCHEMA_MISMATCH",
            message:
              "Las especificaciones del producto no corresponden al esquema actual de la categoría.",
            field: "specifications",
          });
        } else if (specifications.schemaVersion !== currentSpecSchema.schemaVersion) {
          blockers.push({
            code: "SPECIFICATION_VERSION_MISMATCH",
            message: "La versión del esquema de especificaciones del producto está desactualizada.",
            field: "specifications",
          });
        } else {
          const fieldDefs = currentSpecSchema.fieldDefinitions ?? [];
          const validation = validateProductSpecificationValues(
            fieldDefs,
            specifications.specValues ?? {}
          );
          if (!validation.success) {
            blockers.push({
              code: validation.code ?? "SPECIFICATION_VALUES_INVALID",
              message: validation.error ?? "Valores de especificaciones técnicas inválidos.",
              field: validation.field ?? "specifications",
            });
          }
        }
      }
    }
  }

  // 7. Media Relational Integrity Verification
  // Check variant ownership for all attached media
  const variantIdSet = new Set(variants.map((v) => v.id));
  for (const item of media) {
    if (item.variantId !== null && !variantIdSet.has(item.variantId)) {
      blockers.push({
        code: "MEDIA_VARIANT_PRODUCT_MISMATCH",
        message: "Una imagen está asociada a una variante que no pertenece a este producto.",
        field: "media",
      });
    }
  }

  // Primary media evaluation
  let hasValidGlobalPublicImage = false;

  for (const item of media) {
    const asset = item.mediaAsset;
    const isGlobal = item.variantId === null;
    const isPublicImage =
      asset &&
      asset.securityClass === "PUBLIC_MEDIA" &&
      asset.mediaType === "IMAGE" &&
      ALLOWED_IMAGE_MIME_TYPES.includes(asset.mimeType);

    if (isGlobal && isPublicImage) {
      hasValidGlobalPublicImage = true;
    }
  }

  // If primaryMediaId is defined, verify it
  if (product.primaryMediaId) {
    const primaryMediaItem = media.find((m) => m.mediaAssetId === product.primaryMediaId);
    if (!primaryMediaItem) {
      blockers.push({
        code: "PRIMARY_MEDIA_NOT_ATTACHED",
        message: "La imagen principal no está adjunta a este producto.",
        field: "primaryMediaId",
      });
    } else if (primaryMediaItem.variantId !== null) {
      blockers.push({
        code: "PRIMARY_MEDIA_MUST_BE_GLOBAL",
        message:
          "La imagen principal no puede ser específica de una variante; debe ser una imagen global del producto.",
        field: "primaryMediaId",
      });
    } else {
      const asset = primaryMediaItem.mediaAsset ?? primaryMediaAsset;
      if (!asset || asset.securityClass !== "PUBLIC_MEDIA" || asset.mediaType !== "IMAGE") {
        blockers.push({
          code: "PRIMARY_MEDIA_INVALID_ASSET",
          message: "La imagen principal debe ser un asset público de tipo imagen.",
          field: "primaryMediaId",
        });
      }
    }
  }

  if (!hasValidGlobalPublicImage && !product.primaryMediaId) {
    blockers.push({
      code: "NO_VALID_PUBLIC_MEDIA",
      message: "El producto debe tener al menos una imagen pública global para publicarse.",
      field: "media",
    });
  }

  // Soft Warnings (Informational only)
  if (!product.subtitle?.trim()) {
    warnings.push({
      code: "MISSING_SUBTITLE",
      message:
        "Se recomienda incluir un subtítulo para mejorar la visualización en listados y SEO.",
      field: "subtitle",
    });
  }

  if (!product.description?.trim() || product.description.trim().length < 50) {
    warnings.push({
      code: "SHORT_DESCRIPTION",
      message:
        "La descripción del producto es breve (menos de 50 caracteres). Se recomienda enriquecer el contenido.",
      field: "description",
    });
  }

  const activeWithoutCompareAt = activeVariants.filter((v) => !v.compareAtPriceCents);
  if (activeWithoutCompareAt.length > 0) {
    warnings.push({
      code: "NO_COMPARE_AT_PRICE",
      message: "Algunas variantes activas no tienen precio de comparación (precio tachado).",
      field: "compareAtPriceCents",
    });
  }

  const activeWithoutWeight = activeVariants.filter((v) => !v.weightGrams);
  if (activeWithoutWeight.length > 0) {
    warnings.push({
      code: "MISSING_WEIGHT",
      message: "Algunas variantes no tienen peso registrado en gramos.",
      field: "weightGrams",
    });
  }

  return {
    isPublishable: blockers.length === 0,
    blockers,
    warnings,
  };
}
