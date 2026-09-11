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

describe("Admin Catalog Actions Domain Error Mapping (GP-024 / CHK2-BR1)", () => {
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

  it("verifies accurate semantic error messages matching frozen CHK1 contract", () => {
    // INVALID_SKU: trimmed non-empty, <= 50 chars, no invented alphanumeric restrictions
    const skuMapped = mapDomainErrorToUi(new CatalogDomainError("msg", "INVALID_SKU", 400));
    expect(skuMapped.code).toBe("INVALID_SKU");
    expect(skuMapped.error).toContain("50 caracteres");
    expect(skuMapped.error).not.toContain("alfanumérico");
    expect(skuMapped.error).not.toContain("mayúscula");

    // INVALID_PRODUCT_NAME: <= 200 chars, not 255
    const nameMapped = mapDomainErrorToUi(
      new CatalogDomainError("msg", "INVALID_PRODUCT_NAME", 400)
    );
    expect(nameMapped.code).toBe("INVALID_PRODUCT_NAME");
    expect(nameMapped.error).toContain("200 caracteres");
    expect(nameMapped.error).not.toContain("255");

    // INVALID_PRODUCT_SLUG: <= 200 chars, does NOT invent minimum length 3
    const slugMapped = mapDomainErrorToUi(
      new CatalogDomainError("msg", "INVALID_PRODUCT_SLUG", 400)
    );
    expect(slugMapped.code).toBe("INVALID_PRODUCT_SLUG");
    expect(slugMapped.error).toContain("200 caracteres");
    expect(slugMapped.error).not.toContain("entre 3");
    expect(slugMapped.error).not.toContain("mínimo 3");

    // INVALID_PRICE: > 0 (not >= 0)
    const priceMapped = mapDomainErrorToUi(new CatalogDomainError("msg", "INVALID_PRICE", 400));
    expect(priceMapped.code).toBe("INVALID_PRICE");
    expect(priceMapped.error).toContain("mayor a cero");
    expect(priceMapped.error).not.toContain("mayor o igual");

    // INVALID_COMPARE_AT_PRICE: >= 0 (does not claim must be >= selling price)
    const compPriceMapped = mapDomainErrorToUi(
      new CatalogDomainError("msg", "INVALID_COMPARE_AT_PRICE", 400)
    );
    expect(compPriceMapped.code).toBe("INVALID_COMPARE_AT_PRICE");
    expect(compPriceMapped.error).toContain("mayor o igual a cero");
    expect(compPriceMapped.error).not.toContain("mayor o igual al precio de venta");

    // INVALID_COST: >= 0
    const costMapped = mapDomainErrorToUi(new CatalogDomainError("msg", "INVALID_COST", 400));
    expect(costMapped.code).toBe("INVALID_COST");
    expect(costMapped.error).toContain("mayor o igual a cero");

    // INVALID_WEIGHT: > 0 (not >= 0)
    const weightMapped = mapDomainErrorToUi(new CatalogDomainError("msg", "INVALID_WEIGHT", 400));
    expect(weightMapped.code).toBe("INVALID_WEIGHT");
    expect(weightMapped.error).toContain("mayor a cero");
    expect(weightMapped.error).not.toContain("mayor o igual");
  });

  it("fail-closed: unknown CatalogDomainError carrying a secret-looking message returns generic UNKNOWN_ERROR", () => {
    const secretMessage =
      "DATABASE_SECRET_TOKEN=sk_live_xyz987654321; connection to 10.0.0.5 timed out";
    const unknownDomainErr = new CatalogDomainError(secretMessage, "SOME_UNKNOWN_CODE", 500);
    const mapped = mapDomainErrorToUi(unknownDomainErr);

    expect(mapped.code).toBe("UNKNOWN_ERROR");
    expect(mapped.error).toBe("Ocurrió un error inesperado al procesar la solicitud.");
    expect(mapped.error).not.toContain("DATABASE_SECRET_TOKEN");
    expect(mapped.error).not.toContain("10.0.0.5");
  });

  it("fail-closed: arbitrary Error with code such as 23505 and secret-looking message returns generic UNKNOWN_ERROR", () => {
    const secretMessage =
      "duplicate key value violates unique constraint 'users_pkey' SELECT * FROM secrets";
    const dbError = new Error(secretMessage);
    (dbError as unknown as { code: string }).code = "23505";

    const mapped = mapDomainErrorToUi(dbError);

    expect(mapped.code).toBe("UNKNOWN_ERROR");
    expect(mapped.error).toBe("Ocurrió un error inesperado al procesar la solicitud.");
    expect(mapped.error).not.toContain("23505");
    expect(mapped.error).not.toContain("users_pkey");
    expect(mapped.error).not.toContain("secrets");
  });

  it("sanitizes arbitrary non-Error values into generic UNKNOWN_ERROR", () => {
    const mappedNonError = mapDomainErrorToUi({ something: "weird", secretKey: "12345" });
    expect(mappedNonError.code).toBe("UNKNOWN_ERROR");
    expect(mappedNonError.error).toBe("Ocurrió un error inesperado al procesar la solicitud.");
    expect(mappedNonError.error).not.toContain("12345");
  });
});
