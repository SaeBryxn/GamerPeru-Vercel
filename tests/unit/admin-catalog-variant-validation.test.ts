import { describe, expect, it } from "vitest";
import { validateProductVariantInput } from "@/lib/admin/catalog/service";
import { CatalogDomainError } from "@/lib/admin/catalog/types";

describe("validateProductVariantInput - Canonical Variant Mutation Validator", () => {
  const validBase = {
    sku: "TEST-SKU-001",
    title: "Test Variant",
    priceCents: 10000,
    compareAtPriceCents: 12000,
    costCents: 7000,
    weightGrams: 250,
    displayOrder: 0,
    status: "ACTIVE" as const,
    attributes: { color: "Black" },
  };

  it("accepts valid full variant input", () => {
    const res = validateProductVariantInput(validBase, "create");
    expect(res.sku).toBe("TEST-SKU-001");
    expect(res.title).toBe("Test Variant");
    expect(res.priceCents).toBe(10000);
    expect(res.compareAtPriceCents).toBe(12000);
    expect(res.costCents).toBe(7000);
    expect(res.weightGrams).toBe(250);
    expect(res.displayOrder).toBe(0);
    expect(res.status).toBe("ACTIVE");
    expect(res.attributes).toEqual({ color: "Black" });
  });

  it("accepts valid nullable/optional fields", () => {
    const res = validateProductVariantInput(
      {
        sku: "TEST-SKU-002",
        title: "Minimal Variant",
        priceCents: 5000,
      },
      "create"
    );
    expect(res.compareAtPriceCents).toBeNull();
    expect(res.costCents).toBeNull();
    expect(res.weightGrams).toBeNull();
    expect(res.displayOrder).toBe(0);
    expect(res.status).toBe("ACTIVE");
    expect(res.attributes).toEqual({});
  });

  // SKU validation
  it("rejects empty or whitespace SKU", () => {
    expect(() => validateProductVariantInput({ ...validBase, sku: "   " }, "create")).toThrowError(
      CatalogDomainError
    );
    expect(() => validateProductVariantInput({ ...validBase, sku: "" }, "create")).toThrowError(
      CatalogDomainError
    );
  });

  it("rejects SKU exceeding 50 characters", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, sku: "A".repeat(51) }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Title validation
  it("rejects empty or whitespace title", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, title: "   " }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects title exceeding 150 characters", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, title: "A".repeat(151) }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Price validation
  it("rejects priceCents = 1.5 (non-integer)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, priceCents: 1.5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects priceCents = 2147483648 (exceeds int32 max)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, priceCents: 2147483648 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects priceCents <= 0", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, priceCents: 0 }, "create")
    ).toThrowError(CatalogDomainError);
    expect(() =>
      validateProductVariantInput({ ...validBase, priceCents: -100 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // CompareAtPrice validation
  it("rejects compareAtPriceCents = -1", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, compareAtPriceCents: -1 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects compareAtPriceCents = 1.5 (non-integer)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, compareAtPriceCents: 1.5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects compareAtPriceCents = 2147483648", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, compareAtPriceCents: 2147483648 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Cost validation
  it("rejects costCents = -1", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, costCents: -1 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects costCents = 2147483648", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, costCents: 2147483648 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects costCents = 1.5 (non-integer)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, costCents: 1.5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Weight validation
  it("rejects weightGrams = 0 (must be strictly positive if provided)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, weightGrams: 0 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects weightGrams = 1.5 (non-integer)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, weightGrams: 1.5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects weightGrams = -5", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, weightGrams: -5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects weightGrams = 2147483648", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, weightGrams: 2147483648 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // DisplayOrder validation
  it("rejects displayOrder = -1", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, displayOrder: -1 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects displayOrder = 1.5", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, displayOrder: 1.5 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects displayOrder = 2147483648", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, displayOrder: 2147483648 }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Status validation
  it("rejects invalid status supplied through unknown/runtime input", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, status: "DELETED" }, "create")
    ).toThrowError(CatalogDomainError);
  });

  // Attributes validation
  it("rejects attributes = [] (array instead of plain object)", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, attributes: [] }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects attributes with non-string values like { color: 123 }", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, attributes: { color: 123 } }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("rejects empty attribute keys or values", () => {
    expect(() =>
      validateProductVariantInput({ ...validBase, attributes: { "   ": "value" } }, "create")
    ).toThrowError(CatalogDomainError);
    expect(() =>
      validateProductVariantInput({ ...validBase, attributes: { key: "   " } }, "create")
    ).toThrowError(CatalogDomainError);
  });

  it("trims valid attribute keys and values", () => {
    const res = validateProductVariantInput(
      {
        ...validBase,
        attributes: { "  color  ": "  Blue  " },
      },
      "create"
    );
    expect(res.attributes).toEqual({ color: "Blue" });
  });
});
