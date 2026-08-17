import { describe, expect, it } from "vitest";
import { FixtureCatalogDiscoveryReader } from "@/lib/catalog/fixture-reader";

describe("Synthetic FixtureCatalogDiscoveryReader (Lifecycle & Discovery Verification)", () => {
  const reader = new FixtureCatalogDiscoveryReader();

  it("returns published category by slug", async () => {
    const category = await reader.getPublishedCategoryBySlug("mouses");
    expect(category).not.toBeNull();
    expect(category?.name).toBe("Mouses Gaming");
    expect(category?.slug).toBe("mouses");
  });

  it("returns null for non-existent category", async () => {
    const category = await reader.getPublishedCategoryBySlug("non-existent");
    expect(category).toBeNull();
  });

  it("returns null for DRAFT category", async () => {
    const category = await reader.getPublishedCategoryBySlug("categoria-draft");
    expect(category).toBeNull();
  });

  it("returns null for ARCHIVED category", async () => {
    const category = await reader.getPublishedCategoryBySlug("categoria-archived");
    expect(category).toBeNull();
  });

  it("returns published brand by slug", async () => {
    const brand = await reader.getPublishedBrandBySlug("marca-qa");
    expect(brand).not.toBeNull();
    expect(brand?.name).toBe("Marca QA");
    expect(brand?.slug).toBe("marca-qa");
  });

  it("returns null for non-existent brand", async () => {
    const brand = await reader.getPublishedBrandBySlug("non-existent");
    expect(brand).toBeNull();
  });

  it("returns null for DRAFT brand", async () => {
    const brand = await reader.getPublishedBrandBySlug("marca-draft");
    expect(brand).toBeNull();
  });

  it("returns null for ARCHIVED brand", async () => {
    const brand = await reader.getPublishedBrandBySlug("marca-archived");
    expect(brand).toBeNull();
  });

  it("paginates products correctly across pages", async () => {
    const page1 = await reader.getPublishedProductsByCategory(
      "018f0000-0000-7000-8000-000000000001",
      { page: 1, pageSize: 12 }
    );
    expect(page1.totalItems).toBe(14);
    expect(page1.totalPages).toBe(2);
    expect(page1.page).toBe(1);
    expect(page1.items).toHaveLength(12);

    const page2 = await reader.getPublishedProductsByCategory(
      "018f0000-0000-7000-8000-000000000001",
      { page: 2, pageSize: 12 }
    );
    expect(page2.page).toBe(2);
    expect(page2.items).toHaveLength(2);
  });

  it("returns empty result for empty category", async () => {
    const result = await reader.getPublishedProductsByCategory(
      "018f0000-0000-7000-8000-000000000003",
      { page: 1, pageSize: 12 }
    );
    expect(result.totalItems).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
