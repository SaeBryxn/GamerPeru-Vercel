import { describe, expect, it } from "vitest";
import { validateSpecificationSchema } from "@/lib/discovery-filters/schema-validation";

describe("Category Specification Schema Validation (GP-013 Defensive Invariants)", () => {
  it("validates a well-formed schema row", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      isActive: true,
      fieldDefinitions: [
        {
          key: "weight_g",
          label: "Peso",
          dataType: "number",
          unit: "g",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "peso",
          displayOrder: 1,
          min: 30,
          max: 70,
        },
        {
          key: "shape",
          label: "Forma",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "forma",
          displayOrder: 2,
          options: [
            { value: "simetrico", label: "Simétrico" },
            { value: "ergonomico", label: "Ergonómico" },
          ],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).not.toBeNull();
    expect(validated?.id).toBe(rawRow.id);
    expect(validated?.fieldDefinitions).toHaveLength(2);
    expect(validated?.fieldDefinitions[0]?.key).toBe("weight_g");
    expect(validated?.fieldDefinitions[1]?.key).toBe("shape");
  });

  it("fails defensively when publicParam conflicts with reserved URL params", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "bad_param",
          label: "Bad",
          dataType: "string",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "marca", // RESERVED
          displayOrder: 1,
          options: [{ value: "a", label: "A" }],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when duplicate publicParams exist across fields", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "field_one",
          label: "Field 1",
          dataType: "string",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "custom",
          displayOrder: 1,
          options: [{ value: "a", label: "A" }],
        },
        {
          key: "field_two",
          label: "Field 2",
          dataType: "string",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "custom", // DUPLICATE
          displayOrder: 2,
          options: [{ value: "b", label: "B" }],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when ENUM_MULTI has no options defined", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "field_one",
          label: "Field 1",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "custom",
          displayOrder: 1,
          options: [], // EMPTY OPTIONS
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when field key violates snake_case regex", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "InvalidKeyWithCapitals",
          label: "Field 1",
          dataType: "string",
          filterable: false,
          displayOrder: 1,
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });
});
