import { describe, expect, it } from "vitest";
import {
  buildAppliedFilterChips,
  parseDiscoveryUrl,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

const mockMousesSchema: ValidatedSpecificationSchema = {
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

describe("Discovery URL Parser and Serializer (GP-013 Contract & Canonicalization)", () => {
  it("parses valid multi-brand, price, technical, and sort parameters", () => {
    const rawParams = {
      marca: ["wlmouse", "pulsar"],
      precio_min: "100.50",
      precio_max: "300",
      forma: ["ergonomico"],
      peso_min: "35",
      peso_max: "50",
      hotswap: "1",
      sort: "precio-menor",
      page: "2",
    };

    const state = parseDiscoveryUrl(rawParams, "category", mockMousesSchema);

    expect(state.brands).toEqual(["wlmouse", "pulsar"]);
    expect(state.price.minCents).toBe(10050);
    expect(state.price.maxCents).toBe(30000);
    expect(state.technical.shape).toEqual(["ergonomico"]);
    expect(state.technical.weight_g).toEqual({ min: 35, max: 50 });
    expect(state.technical.hotswap).toBe(true);
    expect(state.sort).toBe("precio-menor");
    expect(state.page).toBe(2);
  });

  it("canonicalizes invalid price state away when min > max", () => {
    const rawParams = {
      precio_min: "500",
      precio_max: "200",
    };

    const state = parseDiscoveryUrl(rawParams, "category", mockMousesSchema);
    expect(state.price.minCents).toBeNull();
    expect(state.price.maxCents).toBeNull();
  });

  it("serializes to canonical parameter ordering", () => {
    const state: DiscoveryFilterState = {
      brands: ["wlmouse", "pulsar"],
      categories: ["mouses"],
      price: { minCents: 10000, maxCents: 25000 },
      technical: {
        shape: ["ergonomico"],
        weight_g: { max: 45 },
      },
      sort: "precio-menor",
      page: 2,
    };

    // Category surface (no categoria in URL)
    const categoryUrl = serializeDiscoveryUrl(
      "/categorias/mouses",
      state,
      "category",
      mockMousesSchema,
      { preservePage: true }
    );
    expect(categoryUrl).toBe(
      "/categorias/mouses?marca=pulsar&marca=wlmouse&precio_min=100&precio_max=250&forma=ergonomico&peso_max=45&sort=precio-menor&page=2"
    );

    // Search surface (begins with q, then categoria, marca, price, technical, sort, page)
    const searchUrl = serializeDiscoveryUrl("/buscar", state, "search", mockMousesSchema, {
      searchQuery: "gaming mouse",
      preservePage: true,
    });
    expect(searchUrl).toBe(
      "/buscar?q=gaming%20mouse&categoria=mouses&marca=pulsar&marca=wlmouse&precio_min=100&precio_max=250&forma=ergonomico&peso_max=45&sort=precio-menor&page=2"
    );
  });

  it("omits default sort and page 1 from canonical serialized URL", () => {
    const state: DiscoveryFilterState = {
      brands: ["wlmouse"],
      categories: [],
      price: { minCents: null, maxCents: null },
      technical: {},
      sort: null,
      page: 1,
    };

    const url = serializeDiscoveryUrl("/categorias/mouses", state, "category", mockMousesSchema, {
      preservePage: true,
    });
    expect(url).toBe("/categorias/mouses?marca=wlmouse");
  });

  it("builds correct removable chips and clear links", () => {
    const state: DiscoveryFilterState = {
      brands: ["wlmouse"],
      categories: [],
      price: { minCents: 15000, maxCents: null },
      technical: {
        shape: ["ergonomico"],
      },
      sort: null,
      page: 1,
    };

    const facets: DiscoveryFacets = {
      brands: [{ id: "b1", name: "WLMOUSE", slug: "wlmouse" }],
      categories: [],
      technicalSchema: mockMousesSchema,
      technicalFacets: [
        {
          field: mockMousesSchema.fieldDefinitions[1]!,
          kind: "ENUM_MULTI",
          representedOptions: [{ value: "ergonomico", label: "Ergonómico" }],
        },
      ],
    };

    const chips = buildAppliedFilterChips("/categorias/mouses", state, "category", facets);

    expect(chips).toHaveLength(3);
    expect(chips[0]?.label).toBe("Marca: WLMOUSE");
    expect(chips[1]?.label).toBe("Precio: Desde S/ 150");
    expect(chips[2]?.label).toBe("Forma: Ergonómico");

    // Clicking remove on Brand chip removes brand filter from URL
    expect(chips[0]?.removeHref).toBe("/categorias/mouses?precio_min=150&forma=ergonomico");
  });
});
