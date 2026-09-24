import { describe, expect, it } from "vitest";
import { getQuickResults } from "@/components/search/search-quick-results";
import {
  STOREFRONT_INVENTORY,
  inventoryByCategory,
  slugifyProductName,
} from "@/lib/catalog/storefront-inventory";

describe("storefront inventory", () => {
  it("builds URL-safe slugs from product names", () => {
    expect(slugifyProductName("ATK A9 Plus 2.0 Black")).toBe("atk-a9-plus-2-0-black");
    expect(slugifyProductName("Mchose K7 v2 Ultra+ White Gold")).toBe(
      "mchose-k7-v2-ultra-white-gold"
    );
    expect(slugifyProductName("ATK Sky Orange (Small Size)")).toBe("atk-sky-orange-small-size");
    expect(slugifyProductName("ATK Anime Mouse Pad - Reverie Pink")).toBe(
      "atk-anime-mouse-pad-reverie-pink"
    );
  });

  it("has 14 products with unique slugs, ids and an explicit image path", () => {
    expect(STOREFRONT_INVENTORY).toHaveLength(14);
    expect(new Set(STOREFRONT_INVENTORY.map((item) => item.slug)).size).toBe(14);
    expect(new Set(STOREFRONT_INVENTORY.map((item) => item.id)).size).toBe(14);
    for (const item of STOREFRONT_INVENTORY) {
      expect(item.imagePlaceholder).toBe(`/media/productos/${item.slug}.jpg`);
    }
  });

  it("stores prices in cents and flags the popular mouse first", () => {
    const [first] = inventoryByCategory("mouses");
    expect(first?.name).toBe("ATK A9 Plus 2.0 Black");
    expect(first?.isPopular).toBe(true);
    expect(first?.priceCents).toBe(18900);
  });
});

describe("search quick results", () => {
  it("groups the whole inventory for an empty query", () => {
    const groups = getQuickResults("");
    expect(groups.map((group) => group.label)).toEqual(["Mouse", "Mousepad", "Skates"]);
    expect(groups.reduce((sum, group) => sum + group.products.length, 0)).toBe(14);
  });

  it("matches every word, ignoring case and accents", () => {
    const groups = getQuickResults("SKY órange");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.products.map((p) => p.name)).toEqual([
      "ATK Sky Orange (Large Size)",
      "ATK Sky Orange (Small Size)",
    ]);
  });

  it("matches by group label and brand", () => {
    expect(getQuickResults("skates")[0]?.products).toHaveLength(2);
    expect(getQuickResults("mchose")[0]?.products).toHaveLength(3);
    expect(getQuickResults("zzzz")).toEqual([]);
  });
});
