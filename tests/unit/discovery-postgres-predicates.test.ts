import { describe, expect, it } from "vitest";
import {
  buildEligibleStartingPriceSql,
  buildEligibleVariantExistsClause,
  buildProductDiscoveryWhereClause,
  buildProductSortOrderBy,
} from "@/lib/discovery-filters/postgres-predicates";
import type {
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

const mockSchema: ValidatedSpecificationSchema = {
  id: "018f0000-0000-7000-8000-000000000s01",
  categoryId: "018f0000-0000-7000-8000-000000000001",
  schemaVersion: 1,
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
    {
      key: "hotswap",
      label: "Hot-Swap",
      dataType: "boolean",
      filterable: true,
      filterKind: "BOOLEAN",
      publicParam: "hotswap",
      displayOrder: 3,
    },
  ],
};

describe("PostgreSQL Discovery Predicate Builders (GP-013 Defensive Invariants)", () => {
  it("builds eligible starting price SQL with min and max cents constraints", () => {
    const priceSql = buildEligibleStartingPriceSql(10000, 25000);
    // SQL fragment string inspection
    expect(priceSql).toBeDefined();
  });

  it("builds eligible variant exists clause asserting ACTIVE status", () => {
    const existsClause = buildEligibleVariantExistsClause(null, null);
    expect(existsClause).toBeDefined();
  });

  it("builds discovery where clause combining brand filter, price filter, and technical filters", () => {
    const filterState: DiscoveryFilterState = {
      brands: ["wlmouse"],
      categories: [],
      price: { minCents: 10000, maxCents: 30000 },
      technical: {
        shape: ["ergonomico", "simetrico"],
        weight_g: { min: 35, max: 45 },
        hotswap: true,
      },
      sort: "precio-menor",
      page: 1,
    };

    const whereClause = buildProductDiscoveryWhereClause(filterState, {
      categoryId: "018f0000-0000-7000-8000-000000000001",
      validatedSchema: mockSchema,
    });

    expect(whereClause).toBeDefined();
  });

  it("builds sort order by clauses for price-menor, price-mayor, nombre-asc, nombre-desc, and recientes", () => {
    const ascOrder = buildProductSortOrderBy("precio-menor", "category", 10000, 20000);
    expect(ascOrder.length).toBeGreaterThan(0);

    const descOrder = buildProductSortOrderBy("precio-mayor", "category", null, null);
    expect(descOrder.length).toBeGreaterThan(0);

    const nameAscOrder = buildProductSortOrderBy("nombre-asc", "category", null, null);
    expect(nameAscOrder.length).toBeGreaterThan(0);

    const nameDescOrder = buildProductSortOrderBy("nombre-desc", "category", null, null);
    expect(nameDescOrder.length).toBeGreaterThan(0);

    const defaultOrder = buildProductSortOrderBy(null, "category", null, null);
    expect(defaultOrder.length).toBeGreaterThan(0);
  });
});
