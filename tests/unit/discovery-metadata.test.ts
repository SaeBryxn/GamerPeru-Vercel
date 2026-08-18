import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMetadata as generateCategoryMetadata } from "@/app/(storefront)/categorias/[slug]/page";
import { generateMetadata as generateBrandMetadata } from "@/app/(storefront)/marcas/[slug]/page";
import { generateMetadata as generateSearchMetadata } from "@/app/(storefront)/buscar/page";

function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("GP-013 — Faceted Discovery Page Metadata & Canonical URLs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CI;
    delete process.env.DEV_CATALOG_PREVIEW;
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.PLAYWRIGHT_TEST = "1";
    setNodeEnv("test");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Category Page Metadata", () => {
    it("generates indexable self-canonical metadata for clean category", async () => {
      const meta = await generateCategoryMetadata({
        params: Promise.resolve({ slug: "mouses" }),
        searchParams: Promise.resolve({}),
      });

      expect(meta.title).toBe("Mouses Gaming | Gamer Perú");
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.alternates?.canonical).toBe("https://gamerperu.com/categorias/mouses");
    });

    it("generates noindex metadata with full normalized self-canonical for filtered category", async () => {
      const meta = await generateCategoryMetadata({
        params: Promise.resolve({ slug: "mouses" }),
        searchParams: Promise.resolve({
          marca: "marca-qa",
          precio_min: "150",
          forma: "ergonomico",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/categorias/mouses?marca=marca-qa&precio_min=150&forma=ergonomico"
      );
    });

    it("generates noindex metadata with sort retained for sorted category", async () => {
      const meta = await generateCategoryMetadata({
        params: Promise.resolve({ slug: "mouses" }),
        searchParams: Promise.resolve({ sort: "precio-menor" }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/categorias/mouses?sort=precio-menor"
      );
    });

    it("prunes invalid or unrepresented brand from canonical metadata", async () => {
      const meta = await generateCategoryMetadata({
        params: Promise.resolve({ slug: "mouses" }),
        searchParams: Promise.resolve({
          marca: "marca-no-existe",
          precio_min: "200",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/categorias/mouses?precio_min=200"
      );
    });
  });

  describe("Brand Page Metadata", () => {
    it("generates indexable self-canonical metadata for clean brand", async () => {
      const meta = await generateBrandMetadata({
        params: Promise.resolve({ slug: "marca-qa" }),
        searchParams: Promise.resolve({}),
      });

      expect(meta.title).toContain("Marca QA");
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.alternates?.canonical).toBe("https://gamerperu.com/marcas/marca-qa");
    });

    it("generates noindex metadata with categoria retained for brand + categoria", async () => {
      const meta = await generateBrandMetadata({
        params: Promise.resolve({ slug: "marca-qa" }),
        searchParams: Promise.resolve({ categoria: "mouses" }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/marcas/marca-qa?categoria=mouses"
      );
    });

    it("generates full normalized self-canonical for brand + categoria + technical + price + sort + page", async () => {
      const meta = await generateBrandMetadata({
        params: Promise.resolve({ slug: "marca-qa" }),
        searchParams: Promise.resolve({
          categoria: "mouses",
          forma: "ergonomico",
          precio_min: "120",
          sort: "precio-menor",
          page: "2",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/marcas/marca-qa?categoria=mouses&precio_min=120&forma=ergonomico&sort=precio-menor&page=2"
      );
    });

    it("prunes invalid category and omits page 1 and default sort", async () => {
      const meta = await generateBrandMetadata({
        params: Promise.resolve({ slug: "marca-qa" }),
        searchParams: Promise.resolve({
          categoria: "categoria-invalida",
          precio_min: "100",
          page: "1",
          sort: "recientes",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "https://gamerperu.com/marcas/marca-qa?precio_min=100"
      );
    });
  });

  describe("Search Page Metadata", () => {
    it("generates noindex metadata preserving q and marca", async () => {
      const meta = await generateSearchMetadata({
        searchParams: Promise.resolve({
          q: "mouse",
          marca: "marca-qa",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/buscar?q=mouse&marca=marca-qa");
    });

    it("generates noindex metadata preserving q, categoria, and technical specs", async () => {
      const meta = await generateSearchMetadata({
        searchParams: Promise.resolve({
          q: "mouse",
          categoria: "mouses",
          forma: "ergonomico",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/buscar?q=mouse&categoria=mouses&forma=ergonomico");
    });

    it("generates noindex metadata preserving full state in canonical order", async () => {
      const meta = await generateSearchMetadata({
        searchParams: Promise.resolve({
          q: "mouse",
          categoria: "mouses",
          marca: "marca-qa",
          peso_max: "45",
          precio_min: "100",
          sort: "precio-menor",
          page: "2",
        }),
      });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(
        "/buscar?q=mouse&categoria=mouses&marca=marca-qa&precio_min=100&peso_max=45&sort=precio-menor&page=2"
      );
    });
  });
});
