import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  SkuImmutableError,
  SpecificationSchemaIntegrityError,
  StaleWriteConflictError,
} from "./types";

/**
 * Maps known domain errors to intentional Admin-facing feedback.
 * Pure synchronous mapping safe for client or server components.
 */
export function mapDomainErrorToUi(err: unknown): { error: string; code: string } {
  if (err instanceof CatalogIdempotencyConflictError) {
    return {
      error: "La clave de idempotencia ya fue utilizada con una solicitud diferente.",
      code: "CATALOG_IDEMPOTENCY_CONFLICT",
    };
  }

  if (err instanceof CatalogReplayIntegrityError) {
    return {
      error: "Error en la verificación de repetición de la operación.",
      code: "CATALOG_REPLAY_INTEGRITY_ERROR",
    };
  }

  if (err instanceof StaleWriteConflictError) {
    return {
      error:
        "Este producto o variante cambió desde que abriste la página. Recarga la versión más reciente antes de guardar nuevamente.",
      code: "STALE_WRITE_CONFLICT",
    };
  }

  if (err instanceof SkuImmutableError) {
    return {
      error:
        "Este SKU está vinculado a registros de inventario o pedidos históricos y no puede modificarse.",
      code: "SKU_IMMUTABLE_ERROR",
    };
  }

  if (err instanceof SpecificationSchemaIntegrityError) {
    return {
      error:
        "El esquema de especificaciones técnicas no es íntegro o no corresponde a la categoría.",
      code: "SPECIFICATION_SCHEMA_INTEGRITY_ERROR",
    };
  }

  if (err instanceof CatalogDomainError) {
    switch (err.code) {
      case "SLUG_CONFLICT":
        return {
          error: "Ya existe otro producto con este slug. Por favor ingresa uno diferente.",
          code: "SLUG_CONFLICT",
        };
      case "SKU_CONFLICT":
        return {
          error: "Ya existe una variante con este SKU. Debe ser único.",
          code: "SKU_CONFLICT",
        };
      case "INVALID_SKU":
        return {
          error: "El SKU ingresado no es válido. Debe contener caracteres alfanuméricos válidos.",
          code: "INVALID_SKU",
        };
      case "INVALID_MONEY_SYNTAX":
        return {
          error: "El formato de moneda es inválido. Usa el formato 123.45 con hasta 2 decimales.",
          code: "INVALID_MONEY_SYNTAX",
        };
      case "MONEY_VALUE_EXCEEDS_MAX_INT32":
        return {
          error: "El valor monetario excede el límite máximo permitido.",
          code: "MONEY_VALUE_EXCEEDS_MAX_INT32",
        };
      case "INVALID_PRICE":
        return {
          error: "El precio debe ser un monto válido mayor o igual a cero.",
          code: "INVALID_PRICE",
        };
      case "INVALID_COMPARE_AT_PRICE":
        return {
          error: "El precio de comparación debe ser mayor o igual al precio de venta.",
          code: "INVALID_COMPARE_AT_PRICE",
        };
      case "INVALID_COST":
        return {
          error: "El costo debe ser un monto válido mayor o igual a cero.",
          code: "INVALID_COST",
        };
      case "INVALID_WEIGHT":
        return {
          error: "El peso debe ser un número entero mayor o igual a cero en gramos.",
          code: "INVALID_WEIGHT",
        };
      case "INVALID_STATUS_TRANSITION":
        return {
          error: "La transición de estado solicitada no es válida.",
          code: "INVALID_STATUS_TRANSITION",
        };
      case "NOT_PUBLISHABLE":
        return {
          error: "El producto tiene bloqueadores de publicación activos.",
          code: "NOT_PUBLISHABLE",
        };
      case "PRODUCT_NOT_FOUND":
        return {
          error: "El producto solicitado no existe o no se encuentra disponible.",
          code: "PRODUCT_NOT_FOUND",
        };
      case "VARIANT_NOT_FOUND":
        return {
          error: "La variante solicitada no existe o no se encuentra disponible.",
          code: "VARIANT_NOT_FOUND",
        };
      case "VARIANT_ATTRIBUTES_INVALID":
        return {
          error: "Los atributos de las variantes no son válidos para la publicación.",
          code: "VARIANT_ATTRIBUTES_INVALID",
        };
      case "INVALID_PRODUCT_NAME":
        return {
          error: "El nombre del producto no puede estar vacío ni exceder 255 caracteres.",
          code: "INVALID_PRODUCT_NAME",
        };
      case "INVALID_PRODUCT_SLUG":
        return {
          error:
            "El slug del producto no es válido. Debe contener entre 3 y 200 caracteres en minúsculas, números y guiones.",
          code: "INVALID_PRODUCT_SLUG",
        };
      case "INVALID_BRAND":
        return {
          error: "La marca seleccionada no es válida o no está publicada.",
          code: "INVALID_BRAND",
        };
      case "INVALID_CATEGORY":
        return {
          error: "La categoría seleccionada no es válida o no está publicada.",
          code: "INVALID_CATEGORY",
        };
      case "INVALID_TIMESTAMP":
        return {
          error: "La marca de tiempo esperada para concurrencia optimista no es válida.",
          code: "INVALID_TIMESTAMP",
        };
      case "INVALID_VARIANT_ATTRIBUTES":
        return {
          error: "Los atributos de la variante deben ser un objeto clave-valor de texto.",
          code: "INVALID_VARIANT_ATTRIBUTES",
        };
      case "FORBIDDEN":
        return {
          error: "No tienes los permisos necesarios para realizar esta acción.",
          code: "FORBIDDEN",
        };
      default:
        return {
          error: err.message,
          code: err.code,
        };
    }
  }

  if (
    err instanceof Error &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const code = (err as { code: string }).code;
    return {
      error: err.message,
      code,
    };
  }

  return {
    error: "Ocurrió un error inesperado al procesar la solicitud.",
    code: "UNKNOWN_ERROR",
  };
}
