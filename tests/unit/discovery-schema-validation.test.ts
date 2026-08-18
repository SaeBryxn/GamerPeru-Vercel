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
          dataType: "enum",
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

  it("fails defensively on derived NUMBER_RANGE collision with core params (e.g. precio)", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "price_spec",
          label: "Precio Spec",
          dataType: "number",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "precio", // DERIVES precio_min / precio_max (COLLIDES WITH RESERVED)
          displayOrder: 1,
          min: 10,
          max: 100,
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when sibling field effective parameters overlap", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "weight_range",
          label: "Weight Range",
          dataType: "number",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "peso", // creates peso_min and peso_max
          displayOrder: 1,
          min: 10,
          max: 100,
        },
        {
          key: "weight_min_direct",
          label: "Direct Min",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "peso_min", // COLLIDES WITH DERIVED PARAM
          displayOrder: 2,
          options: [{ value: "a", label: "A" }],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when duplicate enum machine values exist in a field", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "sensor",
          label: "Sensor",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "sensor",
          displayOrder: 1,
          options: [
            { value: "paw3950", label: "PAW 3950" },
            { value: "paw3950", label: "PAW 3950 Duplicate" },
          ],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });

  it("fails defensively when number min > max or step <= 0", () => {
    const rawRow1 = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "bad_range",
          label: "Bad Range",
          dataType: "number",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "bad_range",
          displayOrder: 1,
          min: 100,
          max: 50, // min > max
        },
      ],
    };
    expect(validateSpecificationSchema(rawRow1)).toBeNull();

    const rawRow2 = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "bad_step",
          label: "Bad Step",
          dataType: "number",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "bad_step",
          displayOrder: 1,
          step: -1, // invalid step
        },
      ],
    };
    expect(validateSpecificationSchema(rawRow2)).toBeNull();
  });

  it("fails defensively when duplicate keys exist", () => {
    const rawRow = {
      id: "018f0000-0000-7000-8000-000000000s01",
      categoryId: "018f0000-0000-7000-8000-000000000001",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "same_key",
          label: "Field 1",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "param_1",
          displayOrder: 1,
          options: [{ value: "a", label: "A" }],
        },
        {
          key: "same_key",
          label: "Field 2",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "param_2",
          displayOrder: 2,
          options: [{ value: "b", label: "B" }],
        },
      ],
    };

    const validated = validateSpecificationSchema(rawRow);
    expect(validated).toBeNull();
  });
});
