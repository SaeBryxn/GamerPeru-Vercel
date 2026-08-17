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
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

const MOCK_PRODUCT: ProductDiscoveryItem = {
  id: "prod-1",
  name: "Mouse Gamer Pro X",
  slug: "mouse-gamer-pro-x",
  subtitle: "Sensor 3395 4K",
  brand: {
    name: "WLMouse",
    slug: "wlmouse",
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

      expect(html).toContain("Mouse Gamer Pro X");
      expect(html).toContain("WLMouse");
      expect(html).toContain("Desde");
      expect(html).toContain("S/ 149.90");
      // Fallback stage is rendered
      expect(html).toContain("Gamer Perú");
      // In GP-011, product title is NOT an anchor tag
      expect(html).not.toContain('href="/productos/mouse-gamer-pro-x"');
      // Brand link is rendered
      expect(html).toContain('href="/marcas/wlmouse"');
    });

    it("omits brand link when showBrandLink is false", () => {
      const html = renderToStaticMarkup(
        <ProductCard product={MOCK_PRODUCT} showBrandLink={false} />
      );

      expect(html).toContain("WLMouse");
      expect(html).not.toContain('href="/marcas/wlmouse"');
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
          description="Los mejores mouses ultraligeros de esports."
          breadcrumbs={breadcrumbs}
          totalProducts={14}
        />
      );

      expect(html).toContain("<h1");
      expect(html).toContain("Mouses Gaming</h1>");
      expect(html).toContain("Los mejores mouses ultraligeros de esports.");
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
        <Pagination currentPage={1} totalPages={1} basePath="/categorias/mouses" />
      );
      expect(html).toBe("");
    });

    it("renders accessible navigation links and current page badge", () => {
      const html = renderToStaticMarkup(
        <Pagination currentPage={1} totalPages={2} basePath="/categorias/mouses" />
      );

      expect(html).toContain('aria-label="Paginación"');
      expect(html).toContain('aria-current="page"');
      // On page 1: Previous is disabled
      expect(html).toContain('aria-disabled="true"');
      // Next link points to page 2
      expect(html).toContain('href="/categorias/mouses?page=2"');
    });
  });

  describe("ProductGrid", () => {
    it("renders semantic ul and li items", () => {
      const html = renderToStaticMarkup(<ProductGrid products={[MOCK_PRODUCT]} />);
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
      expect(html).toContain("Mouse Gamer Pro X");
    });
  });
});
