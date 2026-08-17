import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BrandDiscovery,
  CategoryShowcase,
  CuratedGear,
  FeaturedEditorial,
  HomeDiscoveryFooter,
  HomeHero,
  HOMEPAGE_DATA,
  TechnicalEditorial,
} from "@/components/home";

describe("GP-010 Homepage — Presentation Model, Semantics & Business Policy Integrity", () => {
  describe("Static Presentation Seed Integrity", () => {
    it("matches all primary category route intents with GP-009 navigation contracts", () => {
      const expectedCategoryHrefs = [
        "/categorias/mouses",
        "/categorias/teclados",
        "/categorias/mousepads",
        "/categorias/audio",
        "/categorias/accesorios",
      ];

      const actualCategoryHrefs = HOMEPAGE_DATA.categories.map((c) => c.href);
      expect(actualCategoryHrefs).toEqual(expectedCategoryHrefs);
    });

    it("matches all brand route intents with canonical multi-brand contracts", () => {
      const expectedBrandSlugs = ["wlmouse", "pulsar", "lamzu", "atk", "ninjutso"];
      const actualBrandSlugs = HOMEPAGE_DATA.brands.items.map((b) => b.slug);
      expect(actualBrandSlugs).toEqual(expectedBrandSlugs);

      for (const brand of HOMEPAGE_DATA.brands.items) {
        expect(brand.href).toBe(`/marcas/${brand.slug}`);
      }
    });

    it("contains zero empty or javascript: links", () => {
      const json = JSON.stringify(HOMEPAGE_DATA);
      expect(json).not.toContain('href="#"');
      expect(json).not.toContain("javascript:");
    });

    it("contains zero raw style color strings in data contracts", () => {
      const json = JSON.stringify(HOMEPAGE_DATA);
      // Data model should not contain raw hex or rgb color values
      expect(json).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(json).not.toContain("rgb(");
      expect(json).not.toContain("rgba(");
    });
  });

  describe("Commercial Truth & Business Copy Drift Protection", () => {
    it("contains zero unapproved partnership or reseller claims", () => {
      const json = JSON.stringify(HOMEPAGE_DATA).toLowerCase();
      expect(json).not.toContain("marcas oficiales");
      expect(json).not.toContain("distribuidor oficial");
      expect(json).not.toContain("authorized dealer");
      expect(json).not.toContain("partner oficial");
    });

    it("contains zero unapproved operational shipping or delivery promises", () => {
      const json = JSON.stringify(HOMEPAGE_DATA).toLowerCase();
      expect(json).not.toContain("envíos a todo el perú");
      expect(json).not.toContain("envio gratis");
      expect(json).not.toContain("envío gratis");
      expect(json).not.toContain("mismo día");
      expect(json).not.toContain("24 horas");
    });

    it("contains zero fabricated commercial data (prices, stock, discounts, ratings, rankings)", () => {
      const json = JSON.stringify(HOMEPAGE_DATA).toLowerCase();
      expect(json).not.toContain("best seller");
      expect(json).not.toContain("new launch");
      expect(json).not.toContain("just launched");
      expect(json).not.toContain("más vendido");
      expect(json).not.toContain("agotado");
      expect(json).not.toContain("en stock");
      expect(json).not.toContain("descuento");
      expect(json).not.toContain("% off");
      expect(json).not.toContain("rating");
      expect(json).not.toContain("review");
    });

    it("contains zero external reference asset URLs or WLMOUSE media paths", () => {
      const json = JSON.stringify(HOMEPAGE_DATA).toLowerCase();
      expect(json).not.toContain("wlmouse.com");
      expect(json).not.toContain("raw.githubusercontent.com");
      expect(json).not.toContain("hero-pro.mp4");
      expect(json).not.toContain("cutouts_isnet");
    });
  });

  describe("Server Component Structural Rendering", () => {
    it("renders HomeHero with single H1, eyebrow, and semantic CTAs", () => {
      const html = renderToStaticMarkup(<HomeHero hero={HOMEPAGE_DATA.hero} />);
      expect(html).toContain("<h1");
      expect(html).toContain("Periféricos gaming de alto rendimiento");
      expect(html).toContain("Gamer Perú");
      expect(html).toContain('href="/categorias/mouses"');
      expect(html).toContain('href="#categorias"');
    });

    it("renders FeaturedEditorial without fabricated product specifications", () => {
      const html = renderToStaticMarkup(
        <FeaturedEditorial data={HOMEPAGE_DATA.featuredEditorial} />
      );
      expect(html).toContain("Ingeniería ultraligera en magnesio");
      expect(html).toContain('href="/categorias/mouses"');
      expect(html).not.toContain("39g");
      expect(html).not.toContain("PAW3950");
      expect(html).not.toContain("8000Hz");
    });

    it("renders CategoryShowcase with section id='categorias' and all 5 category cards", () => {
      const html = renderToStaticMarkup(<CategoryShowcase categories={HOMEPAGE_DATA.categories} />);
      expect(html).toContain('id="categorias"');
      expect(html).toContain("/categorias/mouses");
      expect(html).toContain("/categorias/teclados");
      expect(html).toContain("/categorias/mousepads");
      expect(html).toContain("/categorias/audio");
      expect(html).toContain("/categorias/accesorios");
    });

    it("renders CuratedGear with neutral category door links", () => {
      const html = renderToStaticMarkup(
        <CuratedGear
          eyebrow={HOMEPAGE_DATA.curatedGear.eyebrow}
          title={HOMEPAGE_DATA.curatedGear.title}
          items={HOMEPAGE_DATA.curatedGear.items}
        />
      );
      expect(html).toContain("Selección Gamer Perú");
      expect(html).toContain("Mouses ultraligeros");
      expect(html).toContain("Teclados magnéticos");
      expect(html).toContain("/categorias/mouses?tipo=ultraligeros");
      expect(html).toContain("/categorias/teclados?formato=magneticos");
    });

    it("renders TechnicalEditorial with canonical giant stat typography and technology concepts", () => {
      const html = renderToStaticMarkup(
        <TechnicalEditorial data={HOMEPAGE_DATA.technicalEditorial} />
      );
      expect(html).toContain("type-stat-giant");
      expect(html).toContain("8000Hz");
      expect(html).toContain("0.125ms");
      expect(html).toContain("Tecnología para respuesta instantánea");
    });

    it("renders BrandDiscovery with section id='marcas' and 5 brand links", () => {
      const html = renderToStaticMarkup(
        <BrandDiscovery
          eyebrow={HOMEPAGE_DATA.brands.eyebrow}
          title={HOMEPAGE_DATA.brands.title}
          items={HOMEPAGE_DATA.brands.items}
        />
      );
      expect(html).toContain('id="marcas"');
      expect(html).toContain("/marcas/wlmouse");
      expect(html).toContain("/marcas/pulsar");
      expect(html).toContain("/marcas/lamzu");
      expect(html).toContain("/marcas/atk");
      expect(html).toContain("/marcas/ninjutso");
    });

    it("renders HomeDiscoveryFooter with 4 grounded trust facts and SEO directory", () => {
      const html = renderToStaticMarkup(
        <HomeDiscoveryFooter
          trustFacts={HOMEPAGE_DATA.discoveryFooter.trustFacts}
          directoryColumns={HOMEPAGE_DATA.discoveryFooter.directoryColumns}
        />
      );
      expect(html).toContain("Selección multimarca");
      expect(html).toContain("Precios y pagos en PEN / S/");
      expect(html).toContain("Verificación manual de pagos");
      expect(html).toContain("Plataforma enfocada en Perú");
      expect(html).toContain("Categorías");
      expect(html).toContain("Marcas");
      expect(html).toContain("Atención");
      expect(html).toContain("Legal");
    });
  });
});
