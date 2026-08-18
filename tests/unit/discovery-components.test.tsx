import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppliedFilters, DiscoveryToolbar, FilteredEmptyState } from "@/components/catalog";
import type { DiscoveryFilterState } from "@/lib/discovery-filters/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("Catalog Discovery Components (GP-013 UI/Accessibility Verification)", () => {
  it("renders DiscoveryToolbar with result count, sort select, and filter launcher", () => {
    const filterState: DiscoveryFilterState = {
      brands: ["wlmouse"],
      categories: [],
      price: { minCents: null, maxCents: null },
      technical: {},
      sort: "precio-menor",
      page: 1,
    };

    const html = renderToString(
      <DiscoveryToolbar
        basePath="/categorias/mouses"
        totalProducts={8}
        filterState={filterState}
        surface="category"
        validatedSchema={null}
        onOpenFilterDrawer={vi.fn()}
      />
    );

    expect(html).toContain("8 productos");
    expect(html).toContain("Filtros");
    expect(html).toContain("Ordenar por:");
    expect(html).toContain('value="precio-menor"');
  });

  it("renders AppliedFilters with chips and clear all button", () => {
    const chips = [
      {
        id: "b1",
        label: "Marca: WLMOUSE",
        type: "brand" as const,
        removeHref: "/categorias/mouses?precio_min=100",
      },
      {
        id: "p1",
        label: "Desde S/ 100",
        type: "price" as const,
        removeHref: "/categorias/mouses?marca=wlmouse",
      },
    ];

    const html = renderToString(<AppliedFilters chips={chips} clearAllHref="/categorias/mouses" />);

    expect(html).toContain("Marca: WLMOUSE");
    expect(html).toContain("Desde S/ 100");
    expect(html).toContain("Limpiar todos");
  });

  it("renders FilteredEmptyState with microcopy and clear button", () => {
    const html = renderToString(<FilteredEmptyState clearHref="/categorias/mouses" />);

    expect(html).toContain("No encontramos productos con estos filtros.");
    expect(html).toContain("Limpiar filtros");
  });
});
