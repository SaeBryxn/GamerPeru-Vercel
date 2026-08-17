import { describe, expect, it } from "vitest";
import { FixtureCatalogDiscoveryReader } from "@/lib/catalog/fixture-reader";

describe("FixtureCatalogDiscoveryReader", () => {
  const reader = new FixtureCatalogDiscoveryReader();

  it("retrieves published categories by slug", async () => {
    const category = await reader.getPublishedCategoryBySlug("mouses");
    expect(category).not.toBeNull();
    expect(category?.name).toBe("Mouses Gaming");
    expect(category?.slug).toBe("mouses");
  });

  it("returns null for unknown categories", async () => {
    const category = await reader.getPublishedCategoryBySlug("nonexistent");
    expect(category).toBeNull();
  });

  it("returns null for DRAFT categories", async () => {
    const category = await reader.getPublishedCategoryBySlug("categoria-draft");
    expect(category).toBeNull();
  });

  it("retrieves published brands by slug", async () => {
    const brand = await reader.getPublishedBrandBySlug("marca-qa");
    expect(brand).not.toBeNull();
    expect(brand?.name).toBe("Marca QA");
  });

  it("returns null for DRAFT brands", async () => {
    const brand = await reader.getPublishedBrandBySlug("marca-draft");
    expect(brand).toBeNull();
  });

  it("paginates products correctly (Page 1 = 12 items, Page 2 = 2 items)", async () => {
    const mousesCategory = await reader.getPublishedCategoryBySlug("mouses");
    expect(mousesCategory).not.toBeNull();

    const page1 = await reader.getPublishedProductsByCategory(mousesCategory!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(page1.totalItems).toBe(14);
    expect(page1.totalPages).toBe(2);
    expect(page1.items.length).toBe(12);
    expect(page1.items[0]?.name).toBe("Mouse Pro Mod 01");

    const page2 = await reader.getPublishedProductsByCategory(mousesCategory!.id, {
      page: 2,
      pageSize: 12,
    });
    expect(page2.items.length).toBe(2);
    expect(page2.items[0]?.name).toBe("Mouse Pro Mod 13");
  });

  it("returns empty items array for empty category", async () => {
    const emptyCategory = await reader.getPublishedCategoryBySlug("categoria-vacia");
    expect(emptyCategory).not.toBeNull();

    const result = await reader.getPublishedProductsByCategory(emptyCategory!.id, {
      page: 1,
      pageSize: 12,
    });
    expect(result.totalItems).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(result.items.length).toBe(0);
  });
});
