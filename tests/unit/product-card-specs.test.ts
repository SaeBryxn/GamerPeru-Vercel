import { describe, it, expect } from "vitest";
import { buildProductCardSpecs, MAX_CARD_SPECS } from "@/lib/catalog/card-specs";
import type { SpecificationFieldDefinition } from "@/db/schema";

const FIELDS: SpecificationFieldDefinition[] = [
  {
    key: "sensor",
    label: "Sensor",
    dataType: "string",
    filterable: false,
    filterKind: "ENUM_MULTI",
    publicParam: "sensor",
    displayOrder: 0,
  },
  {
    key: "polling",
    label: "Polling rate",
    dataType: "number",
    unit: "Hz",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "polling",
    displayOrder: 1,
  },
  {
    key: "peso",
    label: "Peso",
    dataType: "number",
    unit: "g",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "peso",
    displayOrder: 2,
  },
  {
    key: "forma",
    label: "Forma",
    dataType: "enum",
    filterable: true,
    filterKind: "ENUM_MULTI",
    publicParam: "forma",
    displayOrder: 3,
    options: [
      { value: "simetrico", label: "Simétrico (ambidiestro)" },
      { value: "ergonomico", label: "Ergonómico" },
    ],
  },
  {
    key: "inalambrico",
    label: "Inalámbrico",
    dataType: "boolean",
    filterable: true,
    filterKind: "BOOLEAN",
    publicParam: "inalambrico",
    displayOrder: 4,
  },
];

describe("Specs shown on a product card", () => {
  it("returns nothing when the product has no stored values", () => {
    expect(buildProductCardSpecs(null, FIELDS)).toEqual([]);
    expect(buildProductCardSpecs({}, FIELDS)).toEqual([]);
  });

  it("returns nothing when the category has no schema", () => {
    expect(buildProductCardSpecs({ sensor: "PAW3950" }, null)).toEqual([]);
    expect(buildProductCardSpecs({ sensor: "PAW3950" }, [])).toEqual([]);
  });

  it("only reports values the operator actually filled", () => {
    const specs = buildProductCardSpecs({ sensor: "PixArt PAW3950", peso: 49 }, FIELDS);
    expect(specs).toEqual([
      { label: "Sensor", value: "PixArt PAW3950" },
      { label: "Peso", value: "49 g" },
    ]);
  });

  it("appends the declared unit to numbers and drops trailing zeros", () => {
    expect(buildProductCardSpecs({ peso: 49.0 }, FIELDS)).toEqual([
      { label: "Peso", value: "49 g" },
    ]);
    expect(buildProductCardSpecs({ peso: 48.5 }, FIELDS)).toEqual([
      { label: "Peso", value: "48.5 g" },
    ]);
  });

  it("shows the human label of an enum option, not its stored value", () => {
    expect(buildProductCardSpecs({ forma: "ergonomico" }, FIELDS)).toEqual([
      { label: "Forma", value: "Ergonómico" },
    ]);
  });

  it("renders booleans in Spanish", () => {
    expect(buildProductCardSpecs({ inalambrico: true }, FIELDS)).toEqual([
      { label: "Inalámbrico", value: "Sí" },
    ]);
    expect(buildProductCardSpecs({ inalambrico: false }, FIELDS)).toEqual([
      { label: "Inalámbrico", value: "No" },
    ]);
  });

  it("follows the schema's display order, not the order values were stored in", () => {
    const specs = buildProductCardSpecs({ peso: 49, sensor: "PAW3950", polling: 8000 }, FIELDS);
    expect(specs.map((s) => s.label)).toEqual(["Sensor", "Polling rate", "Peso"]);
  });

  it("never shows more specs than a card can hold", () => {
    const specs = buildProductCardSpecs(
      { sensor: "PAW3950", polling: 8000, peso: 49, forma: "simetrico", inalambrico: true },
      FIELDS
    );
    expect(specs).toHaveLength(MAX_CARD_SPECS);
  });

  it("ignores values whose type does not match the schema", () => {
    expect(buildProductCardSpecs({ peso: "muy ligero" }, FIELDS)).toEqual([]);
    expect(buildProductCardSpecs({ sensor: { marca: "PixArt" } }, FIELDS)).toEqual([]);
  });

  it("ignores keys the schema does not declare", () => {
    expect(buildProductCardSpecs({ inventado: "algo" }, FIELDS)).toEqual([]);
  });

  it("skips empty strings instead of rendering a blank spec", () => {
    expect(buildProductCardSpecs({ sensor: "   " }, FIELDS)).toEqual([]);
  });
});
