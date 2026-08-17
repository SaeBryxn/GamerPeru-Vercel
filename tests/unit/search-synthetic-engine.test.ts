import { describe, expect, it } from "vitest";
import {
  executeSyntheticSearch,
  getSyntheticSuggestions,
  scoreSyntheticBrand,
  scoreSyntheticCategory,
  scoreSyntheticProduct,
  searchSyntheticMatchingEntities,
  searchSyntheticProducts,
} from "@/lib/search/synthetic-search-engine";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

describe("GP-012 — Synthetic Search Engine & Relevance Ranking", () => {
  const sampleProduct: ProductDiscoveryItem = {
    id: "018f0000-0000-7000-8000-000000000001",
    name: "Mouse Pro Mod 01",
    slug: "mouse-pro-mod-01",
    subtitle: "Edición de Rendimiento QA 01",
    brand: {
      name: "Marca QA",
      slug: "marca-qa",
    },
    category: {
      name: "Mouses Gaming",
      slug: "mouses",
    },
    primaryMedia: null,
    startingPriceCents: 12990,
  };

  it("scores products with non-overlapping relevance tiers", () => {
    // Exact name (1000)
    const exactScore = scoreSyntheticProduct(sampleProduct, "Mouse Pro Mod 01");
    expect(exactScore).toBe(1000);

    // Exact slug (900)
    const exactSlugScore = scoreSyntheticProduct(sampleProduct, "mouse-pro-mod-01");
    expect(exactSlugScore).toBe(900);

    // Name prefix (800)
    const prefixScore = scoreSyntheticProduct(sampleProduct, "Mouse Pro");
    expect(prefixScore).toBe(800);

    // Name contains (600)
    const containsScore = scoreSyntheticProduct(sampleProduct, "Pro Mod");
    expect(containsScore).toBe(600);

    // Brand exact (300)
    const brandExactScore = scoreSyntheticProduct(sampleProduct, "Marca QA");
    expect(brandExactScore).toBe(300);

    // Brand contains (250)
    const brandContainsScore = scoreSyntheticProduct(sampleProduct, "Marca");
    expect(brandContainsScore).toBe(250);

    // Category exact (200)
    const catExactScore = scoreSyntheticProduct(sampleProduct, "Mouses Gaming");
    expect(catExactScore).toBe(200);

    // Category contains (150)
    const catContainsScore = scoreSyntheticProduct(sampleProduct, "Gaming");
    expect(catContainsScore).toBe(150);

    // Subtitle contains (100)
    const subtitleScore = scoreSyntheticProduct(sampleProduct, "Rendimiento");
    expect(subtitleScore).toBe(100);

    // Unrelated query (0)
    const unrelatedScore = scoreSyntheticProduct(sampleProduct, "teclado");
    expect(unrelatedScore).toBe(0);

    // Assert strict relative ordering
    expect(exactScore).toBeGreaterThan(exactSlugScore);
    expect(exactSlugScore).toBeGreaterThan(prefixScore);
    expect(prefixScore).toBeGreaterThan(containsScore);
    expect(containsScore).toBeGreaterThan(brandExactScore);
    expect(brandExactScore).toBeGreaterThan(brandContainsScore);
    expect(brandContainsScore).toBeGreaterThan(catExactScore);
    expect(catExactScore).toBeGreaterThan(catContainsScore);
    expect(catContainsScore).toBeGreaterThan(subtitleScore);
  });

  it("scores brands and categories deterministically", () => {
    const brandScore = scoreSyntheticBrand({ name: "WLMouse", slug: "wlmouse" }, "WLMouse");
    expect(brandScore).toBe(100);

    const catScore = scoreSyntheticCategory(
      { name: "Teclados Gaming", slug: "teclados" },
      "Teclados"
    );
    expect(catScore).toBe(90); // exact slug match
  });

  it("executes synthetic search for 'mouse' and returns products, categories, and brands", () => {
    const results = executeSyntheticSearch("mouse");

    expect(results.products.length).toBeGreaterThan(0);
    expect(results.products.every((p) => p.name.toLowerCase().includes("mouse"))).toBe(true);

    const suggestionsPromise = getSyntheticSuggestions("mouse");
    return suggestionsPromise.then((suggestions) => {
      expect(suggestions.products.length).toBeLessThanOrEqual(6);
      expect(suggestions.brands.length).toBeLessThanOrEqual(3);
      expect(suggestions.categories.length).toBeLessThanOrEqual(3);
    });
  });

  it("executes synthetic search for 'teclado' and returns category and keyboard products", async () => {
    const results = await searchSyntheticProducts("teclado", {
      page: 1,
      pageSize: 12,
    });

    expect(results.totalItems).toBe(4);
    expect(results.items[0]?.name).toContain("Teclado QA");

    const entities = await searchSyntheticMatchingEntities("teclado");
    expect(entities.categories.some((c) => c.name === "Teclados Gaming")).toBe(true);
  });

  it("returns zero results for unrelated search query", async () => {
    const results = await searchSyntheticProducts("xyznonexistent", {
      page: 1,
      pageSize: 12,
    });
    expect(results.totalItems).toBe(0);
    expect(results.items).toEqual([]);
  });
});
