import { describe, expect, it } from "vitest";
import {
  buildAppliedFilterChips,
  formatTechnicalDecimal,
  parseDiscoveryUrl,
  parseTechnicalDecimal,
  pruneFilterStateAgainstDomains,
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

  it("handles PEN money edge cases (commas, >2 decimals, 0, overflow)", () => {
    expect(parseDiscoveryUrl({ precio_min: "100,90" }, "category").price.minCents).toBe(10090);
    expect(parseDiscoveryUrl({ precio_min: "100.999" }, "category").price.minCents).toBeNull();
    expect(parseDiscoveryUrl({ precio_min: "0" }, "category").price.minCents).toBeNull();
    expect(parseDiscoveryUrl({ precio_min: "-50" }, "category").price.minCents).toBeNull();
    expect(parseDiscoveryUrl({ precio_min: "10000000" }, "category").price.minCents).toBeNull();
  });

  it("parses technical numbers strictly and rejects malformed values", () => {
    expect(parseTechnicalDecimal("45")).toBe(45);
    expect(parseTechnicalDecimal("45.5")).toBe(45.5);
    expect(parseTechnicalDecimal("1e5")).toBeUndefined();
    expect(parseTechnicalDecimal("NaN")).toBeUndefined();
    expect(parseTechnicalDecimal("Infinity")).toBeUndefined();
    expect(parseTechnicalDecimal("abc")).toBeUndefined();
    expect(parseTechnicalDecimal("")).toBeUndefined();
    expect(parseTechnicalDecimal("20", 30, 70)).toBeUndefined();
    expect(parseTechnicalDecimal("80", 30, 70)).toBeUndefined();
  });

  it("handles boolean and enum options correctly (only 1 is truthy, 0 is ignored)", () => {
    const state1 = parseDiscoveryUrl({ hotswap: "1" }, "category", mockMousesSchema);
    expect(state1.technical.hotswap).toBe(true);

    const state0 = parseDiscoveryUrl({ hotswap: "0" }, "category", mockMousesSchema);
    expect(state0.technical.hotswap).toBeUndefined();

    const stateInvalid = parseDiscoveryUrl({ hotswap: "true" }, "category", mockMousesSchema);
    expect(stateInvalid.technical.hotswap).toBeUndefined();
  });

  it("prunes invalid or unrepresented brand and category selections against base domains", () => {
    const allowedBrands = new Set(["wlmouse", "pulsar"]);
    const state = parseDiscoveryUrl(
      { marca: ["wlmouse", "no-existe", "pulsar"] },
      "category",
      null,
      { allowedBrands }
    );
    expect(state.brands).toEqual(["wlmouse", "pulsar"]);

    const unprunedState: DiscoveryFilterState = {
      brands: ["wlmouse", "brand-xyz"],
      categories: ["mouses", "cat-xyz"],
      price: { minCents: null, maxCents: null },
      technical: {},
      sort: null,
      page: 2,
    };

    const pruned = pruneFilterStateAgainstDomains(
      unprunedState,
      new Set(["wlmouse"]),
      new Set(["mouses"])
    );
    expect(pruned.wasPruned).toBe(true);
    expect(pruned.state.brands).toEqual(["wlmouse"]);
    expect(pruned.state.categories).toEqual(["mouses"]);
    expect(pruned.state.page).toBe(1);
  });

  it("serializes to canonical parameter ordering with repeated ENUM_MULTI parameters", () => {
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

    const categoryUrl = serializeDiscoveryUrl(
      "/categorias/mouses",
      state,
      "category",
      mockMousesSchema,
      { preservePage: true }
    );
    expect(categoryUrl).toBe(
      "/categorias/mouses?marca=wlmouse&marca=pulsar&precio_min=100&precio_max=250&forma=ergonomico&peso_max=45&sort=precio-menor&page=2"
    );

    const searchUrl = serializeDiscoveryUrl("/buscar", state, "search", mockMousesSchema, {
      searchQuery: "gaming mouse",
      preservePage: true,
    });
    expect(searchUrl).toBe(
      "/buscar?q=gaming%20mouse&categoria=mouses&marca=wlmouse&marca=pulsar&precio_min=100&precio_max=250&forma=ergonomico&peso_max=45&sort=precio-menor&page=2"
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

  it("builds dismissible filter chips with accurate remove URLs", () => {
    const state: DiscoveryFilterState = {
      brands: ["wlmouse"],
      categories: [],
      price: { minCents: 12000, maxCents: 20000 },
      technical: { shape: ["ergonomico"] },
      sort: null,
      page: 1,
    };

    const facets: DiscoveryFacets = {
      brands: [{ id: "b1", name: "WLMouse", slug: "wlmouse" }],
      categories: [],
      technicalSchema: mockMousesSchema,
      technicalFacets: [],
    };

    const chips = buildAppliedFilterChips("/categorias/mouses", state, "category", facets);

    expect(chips).toHaveLength(3);
    expect(chips[0]?.label).toBe("Marca: WLMouse");
    expect(chips[1]?.label).toBe("Precio: S/ 120 - S/ 200");
    expect(chips[2]?.label).toBe("Forma: Ergonómico");
  });

  describe("Stable Technical Decimal Formatting & Round-Trip", () => {
    it("formats standard numbers without scientific notation", () => {
      expect(formatTechnicalDecimal(45)).toBe("45");
      expect(formatTechnicalDecimal(45.5)).toBe("45.5");
      expect(formatTechnicalDecimal(0.5)).toBe("0.5");
      expect(formatTechnicalDecimal(0.01)).toBe("0.01");
      expect(formatTechnicalDecimal(0.0000001)).toBe("0.0000001");
      expect(formatTechnicalDecimal(0.000000123456789012)).toBe("0.000000123456789012");
      expect(formatTechnicalDecimal(-0.000000123456789012)).toBe("-0.000000123456789012");
      expect(formatTechnicalDecimal(123456.78)).toBe("123456.78");
      expect(formatTechnicalDecimal(-45.5)).toBe("-45.5");
    });

    it("rejects scientific notation in raw technical number input", () => {
      expect(parseTechnicalDecimal("1e-7")).toBeUndefined();
      expect(parseTechnicalDecimal("2E+5")).toBeUndefined();
      expect(parseTechnicalDecimal("1e5")).toBeUndefined();
    });

    it("guarantees round-trip decimal stability (parse -> format -> parse)", () => {
      const testCases = [
        "45",
        "45.5",
        "0.5",
        "0.01",
        "0.0000001",
        "0.000000123456789012",
        "-0.000000123456789012",
        "-45.5",
        "68.25",
      ];
      for (const input of testCases) {
        const parsed = parseTechnicalDecimal(input);
        expect(parsed).toBeDefined();
        const serialized = formatTechnicalDecimal(parsed!);
        expect(serialized).toBe(input);
        expect(serialized).not.toMatch(/[eE]/);
        const reparsed = parseTechnicalDecimal(serialized);
        expect(reparsed).toBe(parsed);
      }
    });

    it("rejects inputs exceeding maximum 20-character safety bound", () => {
      expect(parseTechnicalDecimal("0.123456789012345678901")).toBeUndefined();
    });
  });
});
