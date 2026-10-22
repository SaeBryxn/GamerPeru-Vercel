import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  getProductReadinessGaps,
  getBlockingGaps,
  isReadyToPublish,
} from "@/lib/admin/catalog/list-readiness";
import {
  getReadinessGuidance,
  PRODUCT_EDITOR_SECTIONS,
} from "@/lib/admin/catalog/readiness-guidance";
import type { AdminProductListItem } from "@/lib/admin/catalog/types";

function buildItem(overrides: Partial<AdminProductListItem> = {}): AdminProductListItem {
  return {
    id: "018f0000-0000-7000-8000-00000000d001",
    name: "ATK A9 Plus 2.0 Black",
    slug: "atk-a9-plus-2-0-black",
    status: "DRAFT",
    isFeatured: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    brandId: "brand-1",
    brandName: "ATK",
    categoryId: "category-1",
    categoryName: "Mouses",
    primaryMediaKey: "products/atk/atk-a9/abc.webp",
    primaryMediaAlt: null,
    totalVariants: 1,
    activeVariants: 1,
    minActivePriceCents: 39900,
    maxActivePriceCents: 39900,
    activeVariantAts: 5,
    ...overrides,
  };
}

describe("Readiness gaps shown in the admin product list", () => {
  it("reports no gaps for a complete product", () => {
    expect(getProductReadinessGaps(buildItem())).toEqual([]);
    expect(isReadyToPublish(buildItem())).toBe(true);
  });

  it("flags a missing photo and points at the media section", () => {
    const gaps = getProductReadinessGaps(buildItem({ primaryMediaKey: null }));
    expect(gaps.map((g) => g.id)).toEqual(["media"]);
    expect(gaps[0]?.section).toBe("media");
    expect(gaps[0]?.label).toBe("Falta foto");
  });

  it("flags a product with no active variant without also reporting a missing price", () => {
    const gaps = getProductReadinessGaps(
      buildItem({ activeVariants: 0, minActivePriceCents: null, activeVariantAts: 0 })
    );
    expect(gaps.map((g) => g.id)).toEqual(["variants", "stock"]);
  });

  it("flags a zero price as a missing price", () => {
    const gaps = getProductReadinessGaps(buildItem({ minActivePriceCents: 0 }));
    expect(gaps.map((g) => g.id)).toContain("price");
  });

  it("treats stock as advisory rather than a publication blocker", () => {
    const item = buildItem({ activeVariantAts: 0 });
    expect(getProductReadinessGaps(item).map((g) => g.id)).toContain("stock");
    expect(getBlockingGaps(item)).toEqual([]);
    expect(isReadyToPublish(item)).toBe(true);
  });
});

describe("Plain-language guidance for publish readiness", () => {
  it("covers every blocker and warning code emitted by the readiness engine", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/admin/catalog/publish-readiness.ts"),
      "utf8"
    );
    const codes = Array.from(source.matchAll(/code:\s*"([A-Z_]+)"/g))
      .map((m) => m[1])
      .filter((code): code is string => Boolean(code));
    expect(codes.length).toBeGreaterThan(10);

    const uncovered = Array.from(new Set(codes)).filter(
      (code) => getReadinessGuidance(code).section === "resumen"
    );
    expect(uncovered, `Códigos sin guía: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("routes each code to a real editor section", () => {
    const sections = Object.values(PRODUCT_EDITOR_SECTIONS);
    for (const code of ["PRIMARY_MEDIA_NOT_ATTACHED", "NO_ACTIVE_VARIANTS", "MISSING_WEIGHT"]) {
      expect(sections).toContain(getReadinessGuidance(code).section);
    }
  });

  it("falls back safely for an unknown code", () => {
    const guidance = getReadinessGuidance("SOMETHING_NEW");
    expect(guidance.section).toBe("resumen");
    expect(guidance.action.length).toBeGreaterThan(0);
  });
});
