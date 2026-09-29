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
 *
 * Strict fail-closed boundary:
 * Only explicitly allowlisted canonical domain codes produce specific messages.
 * Any unknown CatalogDomainError code, database error, internal exception, or
 * arbitrary coded error returns generic sanitized UNKNOWN_ERROR behavior.
 * Zero internal details, SQL, constraint names, or credentials are ever returned.
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
          error: "El SKU debe ser un texto no vacío de hasta 50 caracteres.",
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
          error: "El precio debe ser un monto válido mayor a cero.",
          code: "INVALID_PRICE",
        };
      case "INVALID_COMPARE_AT_PRICE":
        return {
          error: "El precio de comparación debe ser un monto válido mayor o igual a cero.",
          code: "INVALID_COMPARE_AT_PRICE",
        };
      case "INVALID_COST":
        return {
          error: "El costo debe ser un monto válido mayor o igual a cero.",
          code: "INVALID_COST",
        };
      case "INVALID_WEIGHT":
        return {
          error: "El peso debe ser un número entero mayor a cero en gramos.",
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
          error: "El nombre del producto no puede estar vacío ni exceder 200 caracteres.",
          code: "INVALID_PRODUCT_NAME",
        };
      case "INVALID_PRODUCT_SLUG":
        return {
          error:
            "El slug del producto no es válido. Debe contener hasta 200 caracteres en minúsculas, números y guiones.",
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
      case "MEDIA_VARIANT_PRODUCT_MISMATCH":
        return {
          error: "La variante no pertenece al producto especificado.",
          code: "MEDIA_VARIANT_PRODUCT_MISMATCH",
        };
      case "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR":
        return {
          error: "Error en la verificación de integridad del intento de subida de medios.",
          code: "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR",
        };
      case "MEDIA_UNSUPPORTED_TYPE":
        return {
          error: "El formato de imagen no es soportado. Formatos aceptados: JPEG, PNG, WebP, AVIF.",
          code: "MEDIA_UNSUPPORTED_TYPE",
        };
      case "MEDIA_FILE_OVERSIZE":
        return {
          error: "El tamaño del archivo excede el límite máximo permitido de 10 MiB.",
          code: "MEDIA_FILE_OVERSIZE",
        };
      case "MEDIA_FILE_EMPTY":
        return {
          error: "El archivo de imagen está vacío.",
          code: "MEDIA_FILE_EMPTY",
        };
      case "MEDIA_CORRUPT_OR_SPOOFED":
        return {
          error: "El archivo no contiene una imagen válida o no coincide con el formato esperado.",
          code: "MEDIA_CORRUPT_OR_SPOOFED",
        };
      case "MEDIA_STAGING_NOT_FOUND":
        return {
          error: "No se encontró el archivo temporal en el almacenamiento intermedio.",
          code: "MEDIA_STAGING_NOT_FOUND",
        };
      case "MEDIA_INTENT_TOKEN_EXPIRED":
        return {
          error: "La autorización temporal para subir el archivo ha expirado.",
          code: "MEDIA_INTENT_TOKEN_EXPIRED",
        };
      case "MEDIA_PUBLIC_INTEGRITY_MISMATCH":
        return {
          error: "Error de integridad al almacenar la imagen pública.",
          code: "MEDIA_PUBLIC_INTEGRITY_MISMATCH",
        };
      case "PRIMARY_MEDIA_MUST_BE_GLOBAL":
        return {
          error: "Solo un medio multimedia global puede ser designado como imagen principal.",
          code: "PRIMARY_MEDIA_MUST_BE_GLOBAL",
        };
      case "PRIMARY_MEDIA_MUST_BE_PUBLIC":
        return {
          error: "Solo medios públicos pueden ser designados como imagen principal.",
          code: "PRIMARY_MEDIA_MUST_BE_PUBLIC",
        };
      case "PRIMARY_MEDIA_MUST_BE_IMAGE":
        return {
          error: "Solo archivos de tipo imagen pueden ser designados como imagen principal.",
          code: "PRIMARY_MEDIA_MUST_BE_IMAGE",
        };
      case "PRIMARY_MEDIA_INVALID_MIME":
        return {
          error: "El formato de la imagen no es válido para ser imagen principal.",
          code: "PRIMARY_MEDIA_INVALID_MIME",
        };
      case "PRIMARY_MEDIA_CANNOT_BE_VARIANT_SPECIFIC":
        return {
          error:
            "No se puede asignar a una variante el medio que respalda la imagen principal actual.",
          code: "PRIMARY_MEDIA_CANNOT_BE_VARIANT_SPECIFIC",
        };
      case "MEDIA_ASSET_NOT_FOUND":
        return {
          error: "El activo multimedia solicitado no existe o no está asociado al producto.",
          code: "MEDIA_ASSET_NOT_FOUND",
        };
      case "PRODUCT_MEDIA_NOT_FOUND":
        return {
          error: "El elemento multimedia solicitado no fue encontrado en este producto.",
          code: "PRODUCT_MEDIA_NOT_FOUND",
        };
      case "INVALID_ALT_TEXT":
        return {
          error: "El texto alternativo no es válido o excede el límite de 255 caracteres.",
          code: "INVALID_ALT_TEXT",
        };
      case "INVALID_REORDER_PAYLOAD":
        return {
          error: "La lista de elementos a reordenar no es válida.",
          code: "INVALID_REORDER_PAYLOAD",
        };
      case "INVALID_MUTATION_REQUEST_ID":
        return {
          error: "El identificador de solicitud de mutación es obligatorio.",
          code: "INVALID_MUTATION_REQUEST_ID",
        };
      case "MEDIA_FILE_TOO_LARGE":
        return {
          error: "El archivo excede el tamaño máximo permitido de 10 MiB.",
          code: "MEDIA_FILE_TOO_LARGE",
        };
      case "INVALID_EXPECTED_UPDATED_AT":
        return {
          error: "La marca de tiempo de actualización esperada no es válida.",
          code: "INVALID_EXPECTED_UPDATED_AT",
        };
      default:
        // Fail-closed for unknown CatalogDomainError codes
        return {
          error: "Ocurrió un error inesperado al procesar la solicitud.",
          code: "UNKNOWN_ERROR",
        };
    }
  }

  // Fail-closed for all unknown errors, database errors, stack traces, etc.
  return {
    error: "Ocurrió un error inesperado al procesar la solicitud.",
    code: "UNKNOWN_ERROR",
  };
}
