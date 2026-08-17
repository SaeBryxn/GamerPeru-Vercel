import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CatalogEmptyState,
  DiscoveryHeader,
  Pagination,
  ProductCard,
  ProductCardFallback,
  ProductGrid,
} from "@/components/catalog";
import { getPaginationPageItems } from "@/components/catalog/pagination/pagination";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

const MOCK_PRODUCT: ProductDiscoveryItem = {
  id: "prod-1",
  name: "Mouse Pro QA 01",
  slug: "mouse-pro-qa-01",
  subtitle: "Sensor 3395 4K",
  brand: {
    name: "Marca QA",
    slug: "marca-qa",
  },
  category: {
    name: "Mouses Gaming",
    slug: "mouses",
  },
  primaryMedia: null,
  startingPriceCents: 14990,
};

describe("Catalog Components (Server Markup)", () => {
  describe("ProductCard", () => {
    it("renders product name, brand, starting price in Soles, and fallback stage when no media", () => {
      const html = renderToStaticMarkup(<ProductCard product={MOCK_PRODUCT} />);

      expect(html).toContain("Mouse Pro QA 01");
      expect(html).toContain("Marca QA");
      expect(html).toContain("Desde");
      expect(html).toContain("S/ 149.90");
      // Fallback stage is rendered
      expect(html).toContain("Gamer Perú");
      // In GP-011 default behavior, product title and media stage are NOT anchor tags
      expect(html).not.toContain('href="/productos/');
      expect(html).not.toContain('href="/test-product"');
      // Brand link is rendered
      expect(html).toContain('href="/marcas/marca-qa"');
    });

    it("renders legitimate product links on media and title when optional href is provided", () => {
      const html = renderToStaticMarkup(
        <ProductCard product={MOCK_PRODUCT} href="/test-product" />
      );

      expect(html).toContain('href="/test-product"');
      // Brand link still exists independently without nested anchor conflict
      expect(html).toContain('href="/marcas/marca-qa"');
    });

    it("omits brand link when showBrandLink is false", () => {
      const html = renderToStaticMarkup(
        <ProductCard product={MOCK_PRODUCT} showBrandLink={false} />
      );

      expect(html).toContain("Marca QA");
      expect(html).not.toContain('href="/marcas/marca-qa"');
    });
  });

  describe("ProductCardFallback", () => {
    it("renders aria-hidden decorative SVG stage", () => {
      const html = renderToStaticMarkup(<ProductCardFallback />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("<svg");
      expect(html).toContain("Gamer Perú");
    });
  });

  describe("DiscoveryHeader", () => {
    it("renders semantic H1, description, breadcrumbs, and product count", () => {
      const breadcrumbs = [
        { label: "Inicio", href: "/" },
        { label: "Categorías", href: "/#categorias" },
        { label: "Mouses Gaming" },
      ];

      const html = renderToStaticMarkup(
        <DiscoveryHeader
          title="Mouses Gaming"
          description="Mouses de alto rendimiento para gaming competitivo."
          breadcrumbs={breadcrumbs}
          totalProducts={14}
        />
      );

      expect(html).toContain("<h1");
      expect(html).toContain("Mouses Gaming</h1>");
      expect(html).toContain("Mouses de alto rendimiento para gaming competitivo.");
      expect(html).toContain("14 productos");
      expect(html).toContain('aria-label="Breadcrumb"');
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/#categorias"');
    });

    it("handles singular product count correctly", () => {
      const html = renderToStaticMarkup(
        <DiscoveryHeader title="Categoría Singular" breadcrumbs={[]} totalProducts={1} />
      );

      expect(html).toContain("1 producto");
      expect(html).not.toContain("1 productos");
    });

    it("renders unsupported future filter notice when enabled", () => {
      const html = renderToStaticMarkup(
        <DiscoveryHeader
          title="Mouses Gaming"
          breadcrumbs={[]}
          totalProducts={14}
          unsupportedFilterNotice={true}
        />
      );

      expect(html).toContain(
        "Este filtro aún no está disponible. Mostrando todos los productos de esta categoría."
      );
    });
  });

  describe("CatalogEmptyState", () => {
    it("renders truthful empty state copy and CTA to /#categorias", () => {
      const html = renderToStaticMarkup(<CatalogEmptyState />);

      expect(html).toContain("Próximamente en Gamer Perú");
      expect(html).toContain("Estamos preparando el catálogo para esta sección.");
      expect(html).toContain('href="/#categorias"');
      expect(html).toContain("Ver categorías");
    });
  });

  describe("Pagination", () => {
    it("returns null when totalPages <= 1", () => {
      const html = renderToStaticMarkup(
        <Pagination currentPage={1} totalPages={1} baseUrl="/categorias/mouses" />
      );
      expect(html).toBe("");
    });

    it("renders accessible navigation links and current page badge", () => {
      const html = renderToStaticMarkup(
        <Pagination currentPage={1} totalPages={2} baseUrl="/categorias/mouses" />
      );

      expect(html).toContain('aria-label="Paginación del catálogo"');
      expect(html).toContain('aria-current="page"');
      // On page 1: Previous is disabled
      expect(html).toContain('aria-disabled="true"');
      // Next link points to page 2
      expect(html).toContain('href="/categorias/mouses?page=2"');
    });

    it("bounds rendered page numbers for a 1000-page result to at most 7 items", () => {
      const pageItems = getPaginationPageItems(50, 1000);
      expect(pageItems).toHaveLength(7);
      expect(pageItems).toEqual([1, "ellipsis", 49, 50, 51, "ellipsis", 1000]);

      const html = renderToStaticMarkup(
        <Pagination currentPage={50} totalPages={1000} baseUrl="/categorias/mouses" />
      );

      // Verify non-link ellipsis is rendered with aria-hidden="true"
      expect(html).toContain('aria-hidden="true">…</span>');
      // Verify bounded markup does not produce thousands of elements
      const linkCount = (html.match(/href=/g) ?? []).length;
      expect(linkCount).toBeLessThanOrEqual(7); // Prev, Next, and at most 5 page links
    });
  });

  describe("Brand Metadata Neutral Copy", () => {
    it("generates neutral description when brand.description is null", () => {
      const brandName = "Marca QA";
      const fallbackDescription = `Catálogo de ${brandName} en Gamer Perú.`;
      expect(fallbackDescription).toBe("Catálogo de Marca QA en Gamer Perú.");
      expect(fallbackDescription).not.toContain("oficial");
      expect(fallbackDescription).not.toContain("autorizado");
    });
  });

  describe("ProductGrid", () => {
    it("renders semantic ul and li items", () => {
      const html = renderToStaticMarkup(<ProductGrid products={[MOCK_PRODUCT]} />);
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
      expect(html).toContain("Mouse Pro QA 01");
    });
  });
});
