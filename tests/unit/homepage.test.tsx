import fs from "node:fs";
import path from "node:path";
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
import type {
  HomeCategoryItem,
  HomeFeaturedEditorialData,
  HomeGearPreviewItem,
  HomeHeroData,
  HomeTechnicalEditorialData,
} from "@/components/home/types";

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
      expect(json).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(json).not.toContain("rgb(");
      expect(json).not.toContain("rgba(");
    });
  });

  describe("Commercial Truth & Business Policy Drift Protection", () => {
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

    it("renders TechnicalEditorial with canonical giant stat typography and nominal polling intervals", () => {
      const html = renderToStaticMarkup(
        <TechnicalEditorial data={HOMEPAGE_DATA.technicalEditorial} />
      );
      expect(html).toContain("type-stat-giant");
      expect(html).toContain("8000Hz");
      expect(html).toContain("0.125ms");
      expect(html).toContain("Intervalo nominal de sondeo");
      expect(html).not.toContain("Latencia de transmisión");
      expect(html).not.toContain("input latency");
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

    it("renders HomeDiscoveryFooter with VisuallyHidden h2, 4 trust facts and SEO directory with h3 headings", () => {
      const html = renderToStaticMarkup(
        <HomeDiscoveryFooter
          trustFacts={HOMEPAGE_DATA.discoveryFooter.trustFacts}
          directoryColumns={HOMEPAGE_DATA.discoveryFooter.directoryColumns}
        />
      );
      expect(html).toContain("<h2");
      expect(html).toContain("Garantías y Directorio Gamer Perú");
      expect(html).toContain("Selección multimarca");
      expect(html).toContain("Precios y pagos en PEN / S/");
      expect(html).toContain("Verificación manual de pagos");
      expect(html).toContain("Plataforma enfocada en Perú");
      expect(html).toContain("<h3");
      expect(html).toContain("Categorías");
      expect(html).toContain("Marcas");
      expect(html).toContain("Atención");
      expect(html).toContain("Legal");
    });
  });

  describe("Media Contract Multi-Slot Polymorphism", () => {
    it("renders HomeHero abstract fallback and image branches without crash", () => {
      // Abstract branch
      const abstractHero: HomeHeroData = {
        ...HOMEPAGE_DATA.hero,
        media: { kind: "abstract" },
      };
      const abstractHtml = renderToStaticMarkup(<HomeHero hero={abstractHero} />);
      expect(abstractHtml).not.toContain("<img");

      // Single Image branch
      const singleImageHero: HomeHeroData = {
        ...HOMEPAGE_DATA.hero,
        media: {
          kind: "image",
          src: "/assets/hero-desktop.webp",
          altText: "Flagship Hero Mouse",
        },
      };
      const singleImageHtml = renderToStaticMarkup(<HomeHero hero={singleImageHero} />);
      expect(singleImageHtml).toContain("<img");
      expect(singleImageHtml).toContain('fetchPriority="high"');

      // Art-directed desktop + mobile image branch
      const artDirectedHero: HomeHeroData = {
        ...HOMEPAGE_DATA.hero,
        media: {
          kind: "image",
          src: "/assets/hero-desktop.webp",
          mobileSrc: "/assets/hero-mobile.webp",
          altText: "Flagship Art-Directed Hero",
        },
      };
      const artDirectedHtml = renderToStaticMarkup(<HomeHero hero={artDirectedHero} />);
      expect(artDirectedHtml).toContain("<picture");
      expect(artDirectedHtml).toContain("<source");
      expect(artDirectedHtml).toContain("<img");
    });

    it("renders FeaturedEditorial abstract and image branches", () => {
      const abstractData: HomeFeaturedEditorialData = {
        ...HOMEPAGE_DATA.featuredEditorial,
        media: { kind: "abstract" },
      };
      const abstractHtml = renderToStaticMarkup(<FeaturedEditorial data={abstractData} />);
      expect(abstractHtml).not.toContain("<img");

      const imageData: HomeFeaturedEditorialData = {
        ...HOMEPAGE_DATA.featuredEditorial,
        media: {
          kind: "image",
          src: "/assets/featured-macro.webp",
          altText: "Macro detalle de aleación de magnesio",
        },
      };
      const imageHtml = renderToStaticMarkup(<FeaturedEditorial data={imageData} />);
      expect(imageHtml).toContain("<img");
    });

    it("renders CategoryCard abstract and image branches", () => {
      const abstractCategory: HomeCategoryItem = {
        id: "mouses",
        title: "Mouses",
        subtitle: "Ultraligeros",
        href: "/categorias/mouses",
        theme: "dark",
        media: { kind: "abstract" },
      };
      const abstractHtml = renderToStaticMarkup(
        <CategoryShowcase categories={[abstractCategory]} />
      );
      expect(abstractHtml).not.toContain("<img");

      const imageCategory: HomeCategoryItem = {
        id: "mouses",
        title: "Mouses",
        subtitle: "Ultraligeros",
        href: "/categorias/mouses",
        theme: "dark",
        media: {
          kind: "image",
          src: "/assets/cat-mouses.png",
          altText: "Mouses gaming ultraligeros",
        },
      };
      const imageHtml = renderToStaticMarkup(<CategoryShowcase categories={[imageCategory]} />);
      expect(imageHtml).toContain("<img");
    });

    it("renders CuratedGear abstract and image branches", () => {
      const abstractItem: HomeGearPreviewItem = {
        id: "gear-1",
        title: "Mouse 8K",
        categoryLabel: "Mouses",
        href: "/categorias/mouses",
        media: { kind: "abstract" },
      };
      const abstractHtml = renderToStaticMarkup(
        <CuratedGear eyebrow="Test" title="Test" items={[abstractItem]} />
      );
      expect(abstractHtml).not.toContain("<img");

      const imageItem: HomeGearPreviewItem = {
        id: "gear-1",
        title: "Mouse 8K",
        categoryLabel: "Mouses",
        href: "/categorias/mouses",
        media: {
          kind: "image",
          src: "/assets/gear-1.png",
          altText: "Mouse ultraligero 8K",
        },
      };
      const imageHtml = renderToStaticMarkup(
        <CuratedGear eyebrow="Test" title="Test" items={[imageItem]} />
      );
      expect(imageHtml).toContain("<img");
    });

    it("renders TechnicalEditorial abstract and image branches", () => {
      const abstractData: HomeTechnicalEditorialData = {
        ...HOMEPAGE_DATA.technicalEditorial,
        media: { kind: "abstract" },
      };
      const abstractHtml = renderToStaticMarkup(<TechnicalEditorial data={abstractData} />);
      expect(abstractHtml).not.toContain("<img");
      expect(abstractHtml).toContain("schematicMedia");

      const imageData: HomeTechnicalEditorialData = {
        ...HOMEPAGE_DATA.technicalEditorial,
        media: {
          kind: "image",
          src: "/assets/sensor-pcb.webp",
          altText: "Diagrama de sensor magnético",
        },
      };
      const imageHtml = renderToStaticMarkup(<TechnicalEditorial data={imageData} />);
      expect(imageHtml).toContain("<img");
      expect(imageHtml).toContain("schematicMedia");
    });
  });

  describe("Accessibility & Media Contract Semantics", () => {
    describe("Abstract Media Stages", () => {
      it("renders abstract media with aria-hidden='true' and zero informative img tags across all components", () => {
        // Hero
        const heroHtml = renderToStaticMarkup(
          <HomeHero hero={{ ...HOMEPAGE_DATA.hero, media: { kind: "abstract" } }} />
        );
        expect(heroHtml).not.toContain("<img");
        expect(heroHtml).toContain('aria-hidden="true"');

        // FeaturedEditorial
        const featuredHtml = renderToStaticMarkup(
          <FeaturedEditorial
            data={{ ...HOMEPAGE_DATA.featuredEditorial, media: { kind: "abstract" } }}
          />
        );
        expect(featuredHtml).not.toContain("<img");
        expect(featuredHtml).toContain('aria-hidden="true"');

        // CategoryShowcase / Card
        const categoryHtml = renderToStaticMarkup(
          <CategoryShowcase
            categories={[
              {
                id: "test-cat",
                title: "Mouses",
                subtitle: "Ultraligeros",
                href: "/categorias/mouses",
                theme: "dark",
                media: { kind: "abstract" },
              },
            ]}
          />
        );
        expect(categoryHtml).not.toContain("<img");
        expect(categoryHtml).toContain('aria-hidden="true"');

        // CuratedGear / HomeGearPreview
        const gearHtml = renderToStaticMarkup(
          <CuratedGear
            eyebrow="Test"
            title="Test"
            items={[
              {
                id: "gear-test",
                title: "Mouse Test",
                categoryLabel: "Mouses",
                href: "/categorias/mouses",
                media: { kind: "abstract" },
              },
            ]}
          />
        );
        expect(gearHtml).not.toContain("<img");
        expect(gearHtml).toContain('aria-hidden="true"');

        // TechnicalEditorial
        const techHtml = renderToStaticMarkup(
          <TechnicalEditorial
            data={{ ...HOMEPAGE_DATA.technicalEditorial, media: { kind: "abstract" } }}
          />
        );
        expect(techHtml).not.toContain("<img");
        expect(techHtml).toContain('aria-hidden="true"');
      });
    });

    describe("Decorative Image Media", () => {
      it("renders alt='' and aria-hidden on decorative image wrappers to prevent duplicate announcements", () => {
        // Hero with decorative: true
        const heroHtml = renderToStaticMarkup(
          <HomeHero
            hero={{
              ...HOMEPAGE_DATA.hero,
              media: {
                kind: "image",
                src: "/assets/hero.webp",
                altText: "Visual reinforcement",
                decorative: true,
              },
            }}
          />
        );
        expect(heroHtml).toContain('alt=""');
        expect(heroHtml).toContain('aria-hidden="true"');

        // FeaturedEditorial with decorative: true
        const featuredHtml = renderToStaticMarkup(
          <FeaturedEditorial
            data={{
              ...HOMEPAGE_DATA.featuredEditorial,
              media: {
                kind: "image",
                src: "/assets/featured.webp",
                altText: "Decorative macro",
                decorative: true,
              },
            }}
          />
        );
        expect(featuredHtml).toContain('alt=""');
        expect(featuredHtml).toContain('aria-hidden="true"');

        // CategoryCard image (decorative inside semantic labeled link)
        const categoryHtml = renderToStaticMarkup(
          <CategoryShowcase
            categories={[
              {
                id: "mouses",
                title: "Mouses",
                subtitle: "Ultraligeros",
                href: "/categorias/mouses",
                theme: "dark",
                media: {
                  kind: "image",
                  src: "/assets/mouses.webp",
                  altText: "Mouses",
                },
              },
            ]}
          />
        );
        expect(categoryHtml).toContain('alt=""');
        expect(categoryHtml).toContain('aria-hidden="true"');

        // HomeGearPreview image (decorative inside semantic labeled link)
        const gearHtml = renderToStaticMarkup(
          <CuratedGear
            eyebrow="Test"
            title="Test"
            items={[
              {
                id: "gear-1",
                title: "Mouse 8K",
                categoryLabel: "Mouses",
                href: "/categorias/mouses",
                media: {
                  kind: "image",
                  src: "/assets/gear.webp",
                  altText: "Mouse",
                },
              },
            ]}
          />
        );
        expect(gearHtml).toContain('alt=""');
        expect(gearHtml).toContain('aria-hidden="true"');

        // TechnicalEditorial with decorative: true
        const techHtml = renderToStaticMarkup(
          <TechnicalEditorial
            data={{
              ...HOMEPAGE_DATA.technicalEditorial,
              media: {
                kind: "image",
                src: "/assets/tech.webp",
                altText: "Decorative schematic",
                decorative: true,
              },
            }}
          />
        );
        expect(techHtml).toContain('alt=""');
        expect(techHtml).toContain('aria-hidden="true"');
      });
    });

    describe("Informative Image Media", () => {
      it("renders provided alt text and ensures informative images are NOT inside aria-hidden subtrees", () => {
        // Informative Hero
        const heroHtml = renderToStaticMarkup(
          <HomeHero
            hero={{
              ...HOMEPAGE_DATA.hero,
              media: {
                kind: "image",
                src: "/assets/hero-unique.webp",
                altText: "Gamer Peru Flagship Mouse Edicion Magnesio",
              },
            }}
          />
        );
        expect(heroHtml).toContain('alt="Gamer Peru Flagship Mouse Edicion Magnesio"');
        // Container must NOT have aria-hidden
        const heroImgMatch = heroHtml.match(/<div class="[^"]*mediaContainer[^"]*">/);
        expect(heroImgMatch).not.toBeNull();
        expect(heroImgMatch?.[0]).not.toContain("aria-hidden");

        // Informative FeaturedEditorial
        const featuredHtml = renderToStaticMarkup(
          <FeaturedEditorial
            data={{
              ...HOMEPAGE_DATA.featuredEditorial,
              media: {
                kind: "image",
                src: "/assets/featured-macro.webp",
                altText: "Estructura de panal en aleacion de magnesio de 39 gramos",
              },
            }}
          />
        );
        expect(featuredHtml).toContain(
          'alt="Estructura de panal en aleacion de magnesio de 39 gramos"'
        );
        const featuredColMatch = featuredHtml.match(/<div class="[^"]*mediaColumn[^"]*">/);
        expect(featuredColMatch).not.toBeNull();
        expect(featuredColMatch?.[0]).not.toContain("aria-hidden");

        // Informative TechnicalEditorial
        const techHtml = renderToStaticMarkup(
          <TechnicalEditorial
            data={{
              ...HOMEPAGE_DATA.technicalEditorial,
              media: {
                kind: "image",
                src: "/assets/sensor-pcb.webp",
                altText: "Diagrama esquematico del sensor optico 8000Hz",
              },
            }}
          />
        );
        expect(techHtml).toContain('alt="Diagrama esquematico del sensor optico 8000Hz"');
        const techMediaMatch = techHtml.match(/<div class="[^"]*schematicMedia[^"]*">/);
        expect(techMediaMatch).not.toBeNull();
        expect(techMediaMatch?.[0]).not.toContain("aria-hidden");
      });
    });
  });

  describe("Homepage CSS Architecture & Token Validation", () => {
    it("verifies zero direct color literals in all Homepage CSS Modules", () => {
      const homeComponentsDir = path.resolve(__dirname, "../../src/components/home");

      function findCssFiles(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...findCssFiles(fullPath));
          } else if (entry.name.endsWith(".module.css")) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const cssFiles = findCssFiles(homeComponentsDir);
      expect(cssFiles.length).toBeGreaterThanOrEqual(5);

      for (const file of cssFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";

          // Skip comments
          if (line.trim().startsWith("/*") || line.trim().startsWith("*")) continue;

          // Reject raw hex colors (e.g. #09090B, #FFF)
          const hexMatch = line.match(/#[0-9a-fA-F]{3,8}\b/);
          expect(
            hexMatch,
            `Direct hex color '${hexMatch?.[0]}' found in ${path.basename(file)}: line ${i + 1}: ${line}`
          ).toBeNull();

          // Reject raw rgb() / rgba()
          const rgbMatch = line.match(/\brgba?\s*\(/);
          expect(
            rgbMatch,
            `Direct rgb/rgba color found in ${path.basename(file)}: line ${i + 1}: ${line}`
          ).toBeNull();

          // Reject raw hsl() / hsla()
          const hslMatch = line.match(/\bhsla?\s*\(/);
          expect(
            hslMatch,
            `Direct hsl/hsla color found in ${path.basename(file)}: line ${i + 1}: ${line}`
          ).toBeNull();
        }
      }
    });

    it("verifies all referenced CSS custom properties exist in canonical tokens", () => {
      const tokensFile = path.resolve(__dirname, "../../src/styles/tokens.css");
      const tokensContent = fs.readFileSync(tokensFile, "utf8");

      // Extract all defined tokens
      const definedTokens = new Set<string>();
      const tokenMatches = tokensContent.matchAll(/--[a-zA-Z0-9_-]+/g);
      for (const m of tokenMatches) {
        definedTokens.add(m[0]);
      }

      // Layout font variables and local contextual overrides
      definedTokens.add("--font-heading");
      definedTokens.add("--font-body");
      definedTokens.add("--font-mono");
      definedTokens.add("--focus-ring-color");

      const homeComponentsDir = path.resolve(__dirname, "../../src/components/home");

      function findCssFiles(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...findCssFiles(fullPath));
          } else if (entry.name.endsWith(".module.css")) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const cssFiles = findCssFiles(homeComponentsDir);
      for (const file of cssFiles) {
        const content = fs.readFileSync(file, "utf8");
        const usedVars = content.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g);

        for (const uv of usedVars) {
          const varName = uv[1];
          if (!varName) continue;
          expect(
            definedTokens.has(varName),
            `Undefined CSS token '${varName}' referenced in ${path.basename(file)}`
          ).toBe(true);
        }
      }
    });
  });
});
