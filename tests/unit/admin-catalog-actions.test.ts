import { describe, expect, it } from "vitest";
import { mapDomainErrorToUi } from "@/lib/admin/catalog/error-mapping";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  SkuImmutableError,
  SpecificationSchemaIntegrityError,
  StaleWriteConflictError,
} from "@/lib/admin/catalog/types";

describe("Admin Catalog Actions Domain Error Mapping", () => {
  it("maps StaleWriteConflictError with STALE_WRITE_CONFLICT code", () => {
    const err = new StaleWriteConflictError();
    const mapped = mapDomainErrorToUi(err);
    expect(mapped.code).toBe("STALE_WRITE_CONFLICT");
    expect(mapped.error).toContain("cambió desde que abriste la página");
  });

  it("maps SkuImmutableError with SKU_IMMUTABLE_ERROR code", () => {
    const err = new SkuImmutableError();
    const mapped = mapDomainErrorToUi(err);
    expect(mapped.code).toBe("SKU_IMMUTABLE_ERROR");
    expect(mapped.error).toContain("está vinculado a registros de inventario");
  });

  it("maps SpecificationSchemaIntegrityError with SPECIFICATION_SCHEMA_INTEGRITY_ERROR code", () => {
    const err = new SpecificationSchemaIntegrityError();
    const mapped = mapDomainErrorToUi(err);
    expect(mapped.code).toBe("SPECIFICATION_SCHEMA_INTEGRITY_ERROR");
  });

  it("maps CatalogIdempotencyConflictError with CATALOG_IDEMPOTENCY_CONFLICT code", () => {
    const err = new CatalogIdempotencyConflictError();
    const mapped = mapDomainErrorToUi(err);
    expect(mapped.code).toBe("CATALOG_IDEMPOTENCY_CONFLICT");
  });

  it("maps CatalogReplayIntegrityError with CATALOG_REPLAY_INTEGRITY_ERROR code", () => {
    const err = new CatalogReplayIntegrityError();
    const mapped = mapDomainErrorToUi(err);
    expect(mapped.code).toBe("CATALOG_REPLAY_INTEGRITY_ERROR");
  });

  it("maps CatalogDomainError specific validation codes per Amendment 4", () => {
    const codes = [
      "SLUG_CONFLICT",
      "SKU_CONFLICT",
      "INVALID_SKU",
      "INVALID_MONEY_SYNTAX",
      "MONEY_VALUE_EXCEEDS_MAX_INT32",
      "INVALID_PRICE",
      "INVALID_COMPARE_AT_PRICE",
      "INVALID_COST",
      "INVALID_WEIGHT",
      "INVALID_STATUS_TRANSITION",
      "NOT_PUBLISHABLE",
      "PRODUCT_NOT_FOUND",
      "VARIANT_NOT_FOUND",
      "VARIANT_ATTRIBUTES_INVALID",
      "INVALID_PRODUCT_NAME",
      "INVALID_PRODUCT_SLUG",
      "INVALID_BRAND",
      "INVALID_CATEGORY",
      "INVALID_TIMESTAMP",
      "INVALID_VARIANT_ATTRIBUTES",
      "FORBIDDEN",
    ] as const;

    for (const code of codes) {
      const err = new CatalogDomainError(`Error test for ${code}`, code, 400);
      const mapped = mapDomainErrorToUi(err);
      expect(mapped.code).toBe(code);
      expect(mapped.error.length).toBeGreaterThan(0);
    }
  });

  it("sanitizes unexpected unknown errors into generic UNKNOWN_ERROR", () => {
    const mapped = mapDomainErrorToUi(new Error("Secret database stack trace or credential"));
    expect(mapped.error).toBe("Ocurrió un error inesperado al procesar la solicitud.");
    expect(mapped.code).toBe("UNKNOWN_ERROR");

    const mappedNonError = mapDomainErrorToUi({ something: "weird" });
    expect(mappedNonError.code).toBe("UNKNOWN_ERROR");
    expect(mappedNonError.error).toBe("Ocurrió un error inesperado al procesar la solicitud.");
  });
});
