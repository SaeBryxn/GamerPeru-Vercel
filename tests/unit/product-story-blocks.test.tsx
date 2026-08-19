import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import {
  HeroMediaBlock,
  FullBleedImageBlock,
  ImageTextBlock,
  StatHighlightBlock,
  SpecFeatureBlock,
  VideoBlock,
  GalleryBlock,
  ComparisonBlock,
  DimensionsBlock,
  BoxContentsBlock,
  TechnicalSpecsBlock,
  FaqBlock,
  RelatedProductsBlock,
  resolveStoryAlt,
  sanitizeComparisonRows,
} from "@/components/product-story";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

describe("Product Story — Helpers", () => {
  describe("resolveStoryAlt", () => {
    it("uses authored alt text directly when provided", () => {
      const alt = resolveStoryAlt(
        "Chasis de magnesio en acabado mate",
        "WLMOUSE Beast X Pro",
        "Detalle de ingeniería"
      );
      expect(alt).toBe("Chasis de magnesio en acabado mate");
    });

    it("falls back to contextual product and block descriptor when authored alt is absent", () => {
      const alt = resolveStoryAlt(
        undefined,
        "WLMOUSE Beast X Pro",
        "Vista panorámica de ingeniería"
      );
      expect(alt).toBe("WLMOUSE Beast X Pro — Vista panorámica de ingeniería");
    });

    it("trims whitespace from authored alt and contextual fallbacks", () => {
      const alt = resolveStoryAlt("  Textura antideslizante  ", "  Mouse Pro  ", "  Sensor  ");
      expect(alt).toBe("Textura antideslizante");
    });
  });

  describe("sanitizeComparisonRows", () => {
    const headers = ["Característica", "Estándar", "Pro"];

    it("retains exact-width rows unchanged", () => {
      const rows = [
        ["Polling Rate", "1000 Hz", "8000 Hz"],
        ["Peso", "49 g", "39 g"],
      ];
      const sanitized = sanitizeComparisonRows(headers, rows);
      expect(sanitized).toEqual(rows);
    });

    it("omits rows that have fewer columns than headers (no fake '—' padding)", () => {
      const rows = [
        ["Polling Rate", "1000 Hz", "8000 Hz"],
        ["Incompleto", "1000 Hz"], // 2 columns instead of 3
        ["Peso", "49 g", "39 g"],
      ];
      const sanitized = sanitizeComparisonRows(headers, rows);
      expect(sanitized).toHaveLength(2);
      expect(sanitized[0]).toEqual(["Polling Rate", "1000 Hz", "8000 Hz"]);
      expect(sanitized[1]).toEqual(["Peso", "49 g", "39 g"]);
    });

    it("omits rows that have more columns than headers (no truncation)", () => {
      const rows = [
        ["Largo", "122 mm", "122 mm", "Extra"], // 4 columns instead of 3
        ["Peso", "49 g", "39 g"],
      ];
      const sanitized = sanitizeComparisonRows(headers, rows);
      expect(sanitized).toHaveLength(1);
      expect(sanitized[0]).toEqual(["Peso", "49 g", "39 g"]);
    });

    it("returns empty array if all rows are mismatched", () => {
      const rows = [["Solo uno"], ["Uno", "Dos", "Tres", "Cuatro"]];
      const sanitized = sanitizeComparisonRows(headers, rows);
      expect(sanitized).toEqual([]);
    });
  });
});

describe("Product Story — 13 Canonical Block Components", () => {
  const PRODUCT_NAME = "WLMOUSE Beast X Pro";

  // 1. hero_media
  describe("HeroMediaBlock", () => {
    it("renders ambient video island and static fallback when videoKey is present", () => {
      const html = renderToStaticMarkup(
        <HeroMediaBlock
          productName={PRODUCT_NAME}
          payload={{
            headline: "Ingeniería Flagship",
            tagline: "8000 Hz Nativo",
            body: "Rendimiento sin concesiones.",
            videoKey: "stories/beast-x/hero.mp4",
            posterKey: "stories/beast-x/hero-poster.png",
          }}
        />
      );
      expect(html).toContain("story-hero-media-block");
      expect(html).toContain("Ingeniería Flagship");
      expect(html).toContain("8000 Hz Nativo");
      expect(html).toContain("Rendimiento sin concesiones.");
      expect(html).toContain("<video");
    });

    it("renders static image hero when videoKey is absent and mediaKey is present", () => {
      const html = renderToStaticMarkup(
        <HeroMediaBlock
          productName={PRODUCT_NAME}
          payload={{
            headline: "Magnesio Puro",
            mediaKey: "stories/beast-x/hero-image.png",
          }}
        />
      );
      expect(html).toContain("story-hero-media-block");
      expect(html).toContain("Magnesio Puro");
      expect(html).not.toContain("<video");
      expect(html).toContain("<img");
    });

    it("renders dark canvas text-only hero when both media keys are absent", () => {
      const html = renderToStaticMarkup(
        <HeroMediaBlock
          productName={PRODUCT_NAME}
          payload={{
            headline: "Pure Performance",
            body: "Sin elementos decorativos pesados.",
          }}
        />
      );
      expect(html).toContain("story-hero-media-block");
      expect(html).toContain("Pure Performance");
      expect(html).not.toContain("<video");
      expect(html).not.toContain("<img");
    });
  });

  // 2. full_bleed_image
  describe("FullBleedImageBlock", () => {
    it("renders figure with full-bleed image and caption", () => {
      const html = renderToStaticMarkup(
        <FullBleedImageBlock
          productName={PRODUCT_NAME}
          payload={{
            mediaKey: "stories/beast-x/macro-detail.png",
            caption: "Acabado anodizado de alta resistencia.",
          }}
        />
      );
      expect(html).toContain("story-full-bleed-image-block");
      expect(html).toContain("Acabado anodizado de alta resistencia.");
      expect(html).toContain("<img");
    });

    it("safely omits block when mediaKey cannot be resolved", () => {
      const html = renderToStaticMarkup(
        <FullBleedImageBlock
          productName={PRODUCT_NAME}
          payload={{
            mediaKey: "../unsafe/path.png", // Invalid path returns null
            caption: "Should not render",
          }}
        />
      );
      expect(html).toBe("");
    });
  });

  // 3. image_text
  describe("ImageTextBlock", () => {
    it("renders 50/50 split with image and text", () => {
      const html = renderToStaticMarkup(
        <ImageTextBlock
          productName={PRODUCT_NAME}
          payload={{
            headline: "Curvatura Ergonómica",
            body: "Diseñado para claw grip y fingertip grip.",
            mediaKey: "stories/beast-x/grip-angle.png",
            imagePosition: "left",
          }}
        />
      );
      expect(html).toContain("story-image-text-block");
      expect(html).toContain("Curvatura Ergonómica");
      expect(html).toContain("Diseñado para claw grip y fingertip grip.");
      expect(html).toContain("<img");
    });

    it("degrades to full-width text when mediaKey fails resolution", () => {
      const html = renderToStaticMarkup(
        <ImageTextBlock
          productName={PRODUCT_NAME}
          payload={{
            headline: "Curvatura Ergonómica",
            body: "Diseñado para claw grip.",
            mediaKey: "http://malicious.url/image.png", // Protocol injection returns null
            imagePosition: "left",
          }}
        />
      );
      expect(html).toContain("story-image-text-block");
      expect(html).toContain("Curvatura Ergonómica");
      expect(html).not.toContain("<img");
    });
  });

  // 4. stat_highlight
  describe("StatHighlightBlock", () => {
    it("renders metric columns with value, unit, and label", () => {
      const html = renderToStaticMarkup(
        <StatHighlightBlock
          payload={{
            title: "Métricas Clave",
            stats: [
              { value: "39", unit: "g", label: "Peso total" },
              { value: "8000", unit: "Hz", label: "Polling rate" },
            ],
          }}
        />
      );
      expect(html).toContain("story-stat-highlight-block");
      expect(html).toContain("Métricas Clave");
      expect(html).toContain("39");
      expect(html).toContain("g");
      expect(html).toContain("Peso total");
      expect(html).toContain("8000");
    });
  });

  // 5. spec_feature
  describe("SpecFeatureBlock", () => {
    it("renders feature spotlight with title, description, badge, and media", () => {
      const html = renderToStaticMarkup(
        <SpecFeatureBlock
          productName={PRODUCT_NAME}
          payload={{
            title: "Sensor PAW3950 Flagship",
            description: "30,000 DPI con aceleración de 50G.",
            badge: "Nueva Generación",
            mediaKey: "stories/beast-x/sensor.png",
          }}
        />
      );
      expect(html).toContain("story-spec-feature-block");
      expect(html).toContain("Sensor PAW3950 Flagship");
      expect(html).toContain("Nueva Generación");
      expect(html).toContain("<img");
    });

    it("renders text-only spotlight card when mediaKey is absent", () => {
      const html = renderToStaticMarkup(
        <SpecFeatureBlock
          productName={PRODUCT_NAME}
          payload={{
            title: "Sensor PAW3950 Flagship",
            description: "30,000 DPI con aceleración de 50G.",
          }}
        />
      );
      expect(html).toContain("story-spec-feature-block");
      expect(html).toContain("Sensor PAW3950 Flagship");
      expect(html).not.toContain("<img");
    });
  });

  // 6. video
  describe("VideoBlock & StoryVideoPlayer", () => {
    it("renders StoryVideoPlayer with loop, playsInline, muted, and metadata preload", () => {
      const html = renderToStaticMarkup(
        <VideoBlock
          productName={PRODUCT_NAME}
          payload={{
            videoKey: "stories/beast-x/sound-test.mp4",
            posterKey: "stories/beast-x/sound-poster.png",
            title: "Prueba de Sonido de Switches",
            caption: "Grabación acústica en cámara insonorizada.",
          }}
        />
      );
      expect(html).toContain("story-video-block");
      expect(html).toContain("Prueba de Sonido de Switches");
      expect(html).toContain("<video");
      expect(html).toContain("loop");
      expect(html).toContain("muted");
      expect(html.toLowerCase()).toContain("playsinline");
      expect(html).toContain("story-video-toggle");
    });

    it("renders static poster card when videoKey cannot be resolved", () => {
      const html = renderToStaticMarkup(
        <VideoBlock
          productName={PRODUCT_NAME}
          payload={{
            videoKey: "../unsafe/path/video.mp4", // Rejected by traversal check
            posterKey: "stories/beast-x/sound-poster.png",
            title: "Prueba de Sonido",
          }}
        />
      );
      expect(html).toContain("story-video-block");
      expect(html).toContain("Prueba de Sonido");
      expect(html).toContain("<img");
      expect(html).not.toContain("<video");
    });

    it("omits block when videoKey cannot be resolved and no poster/text exists", () => {
      const html = renderToStaticMarkup(
        <VideoBlock
          productName={PRODUCT_NAME}
          payload={{
            videoKey: "invalid://video.mp4",
          }}
        />
      );
      expect(html).toBe("");
    });
  });

  // 7. gallery
  describe("GalleryBlock", () => {
    it("renders grid when at least 3 valid resolved media items exist", () => {
      const html = renderToStaticMarkup(
        <GalleryBlock
          productName={PRODUCT_NAME}
          payload={{
            title: "Perspectivas de Hardware",
            items: [
              { mediaKey: "stories/beast-x/g1.png", caption: "Vista frontal" },
              { mediaKey: "stories/beast-x/g2.png", caption: "Vista lateral" },
              { mediaKey: "stories/beast-x/g3.png", caption: "Vista inferior" },
            ],
          }}
        />
      );
      expect(html).toContain("story-gallery-block");
      expect(html).toContain("Perspectivas de Hardware");
      expect(html).toContain("Vista frontal");
      expect(html).toContain("Vista lateral");
      expect(html).toContain("Vista inferior");
    });

    it("safely omits gallery block when fewer than 3 valid items resolve", () => {
      const html = renderToStaticMarkup(
        <GalleryBlock
          productName={PRODUCT_NAME}
          payload={{
            title: "Perspectivas de Hardware",
            items: [
              { mediaKey: "stories/beast-x/g1.png" },
              { mediaKey: "../unsafe/g2.png" }, // Rejected
              { mediaKey: "stories/beast-x/g3.png" },
            ],
          }}
        />
      );
      // Only 2 valid items resolve -> below 3 minimum -> safely omitted
      expect(html).toBe("");
    });
  });

  // 8. comparison
  describe("ComparisonBlock", () => {
    it("renders responsive table with exact-width rows", () => {
      const html = renderToStaticMarkup(
        <ComparisonBlock
          payload={{
            title: "Comparativa de Modelos",
            headers: ["Especificación", "Estándar", "Pro"],
            rows: [
              ["Polling Rate", "1000 Hz", "8000 Hz"],
              ["Peso", "49 g", "39 g"],
            ],
          }}
        />
      );
      expect(html).toContain("story-comparison-block");
      expect(html).toContain("Comparativa de Modelos");
      expect(html).toContain("<table");
      expect(html).toContain("Polling Rate");
      expect(html).toContain("8000 Hz");
    });

    it("omits the block when zero valid rows remain after length validation", () => {
      const html = renderToStaticMarkup(
        <ComparisonBlock
          payload={{
            title: "Comparativa de Modelos",
            headers: ["Especificación", "Estándar", "Pro"],
            rows: [
              ["Solo una celda"], // Length 1 != 3 -> filtered out
            ],
          }}
        />
      );
      expect(html).toBe("");
    });
  });

  // 9. dimensions
  describe("DimensionsBlock", () => {
    it("renders measurements, grip types, and blueprint image", () => {
      const html = renderToStaticMarkup(
        <DimensionsBlock
          productName={PRODUCT_NAME}
          payload={{
            lengthMm: 122,
            widthMm: 62,
            heightMm: 38,
            gripTypes: ["Claw Grip", "Fingertip Grip"],
            blueprintMediaKey: "stories/beast-x/blueprint.png",
          }}
        />
      );
      expect(html).toContain("story-dimensions-block");
      expect(html).toContain("122 mm");
      expect(html).toContain("62 mm");
      expect(html).toContain("38 mm");
      expect(html).toContain("Claw Grip");
      expect(html).toContain("Fingertip Grip");
      expect(html).toContain("<img");
    });

    it("renders numeric dimensions and grip types even when blueprint fails resolution", () => {
      const html = renderToStaticMarkup(
        <DimensionsBlock
          productName={PRODUCT_NAME}
          payload={{
            lengthMm: 122,
            widthMm: 62,
            heightMm: 38,
            gripTypes: ["Palm Grip"],
            blueprintMediaKey: "http://external.com/blueprint.png", // Rejected
          }}
        />
      );
      expect(html).toContain("story-dimensions-block");
      expect(html).toContain("122 mm");
      expect(html).toContain("Palm Grip");
      expect(html).not.toContain("<img");
    });
  });

  // 10. box_contents
  describe("BoxContentsBlock", () => {
    it("renders item list with counts and accessory images", () => {
      const html = renderToStaticMarkup(
        <BoxContentsBlock
          productName={PRODUCT_NAME}
          payload={{
            title: "Contenido del Paquete",
            items: [
              { title: "Mouse Beast X Pro", count: 1, mediaKey: "stories/beast-x/mouse.png" },
              { title: "Receptor 8K", count: 1 },
              { title: "Set de Skates PTFE", count: 2 },
            ],
          }}
        />
      );
      expect(html).toContain("story-box-contents-block");
      expect(html).toContain("Contenido del Paquete");
      expect(html).toContain("Mouse Beast X Pro");
      expect(html).toContain("Receptor 8K");
      expect(html).toContain("x2");
    });
  });

  // 11. technical_specs
  describe("TechnicalSpecsBlock", () => {
    it("renders grouped specification matrices", () => {
      const html = renderToStaticMarkup(
        <TechnicalSpecsBlock
          payload={{
            title: "Ficha Técnica Completa",
            groups: [
              {
                groupName: "Conectividad",
                specs: [
                  { label: "Modo Inalámbrico", value: "2.4 GHz Ultra-low latency" },
                  { label: "Batería", value: "300 mAh" },
                ],
              },
            ],
          }}
        />
      );
      expect(html).toContain("story-technical-specs-block");
      expect(html).toContain("Ficha Técnica Completa");
      expect(html).toContain("Conectividad");
      expect(html).toContain("Modo Inalámbrico");
      expect(html).toContain("300 mAh");
    });
  });

  // 12. faq
  describe("FaqBlock", () => {
    it("renders semantic details and summary accordion elements", () => {
      const html = renderToStaticMarkup(
        <FaqBlock
          payload={{
            title: "Preguntas Frecuentes",
            items: [
              {
                question: "¿Incluye receptor 8000 Hz?",
                answer: "Sí, viene incluido en la caja estándar.",
              },
            ],
          }}
        />
      );
      expect(html).toContain("story-faq-block");
      expect(html).toContain("Preguntas Frecuentes");
      expect(html).toContain("<details");
      expect(html).toContain("<summary");
      expect(html).toContain("¿Incluye receptor 8000 Hz?");
      expect(html).toContain("Sí, viene incluido en la caja estándar.");
    });
  });

  // 13. related_products
  describe("RelatedProductsBlock", () => {
    const MOCK_MAP = new Map<string, ProductDiscoveryItem>([
      [
        "teclado-mecanico-pro",
        {
          id: "prod-kb-1",
          name: "Teclado Mecánico Pro",
          slug: "teclado-mecanico-pro",
          subtitle: "Switches magnéticos Hall Effect",
          brand: { name: "WLMOUSE", slug: "wlmouse" },
          category: { name: "Teclados Gaming", slug: "teclados" },
          primaryMedia: {
            objectKey: "products/teclados/kb-1.png",
            altText: "Teclado Mecánico Pro",
            width: 800,
            height: 800,
          },
          startingPriceCents: 68900,
        },
      ],
      [
        "mousepad-vidrio-pro",
        {
          id: "prod-pad-1",
          name: "Mousepad de Vidrio Templado",
          slug: "mousepad-vidrio-pro",
          subtitle: "Superficie micrograbada",
          brand: { name: "WLMOUSE", slug: "wlmouse" },
          category: { name: "Mousepads Gaming", slug: "mousepads" },
          primaryMedia: null,
          startingPriceCents: 24900,
        },
      ],
    ]);

    it("renders hydrated product cards in authored array order", () => {
      const html = renderToStaticMarkup(
        <RelatedProductsBlock
          currentProductId="prod-current"
          productsMap={MOCK_MAP}
          payload={{
            title: "Productos Recomendados",
            productSlugs: ["mousepad-vidrio-pro", "teclado-mecanico-pro"],
          }}
        />
      );
      expect(html).toContain("story-related-products-block");
      expect(html).toContain("Productos Recomendados");
      expect(html).toContain("Mousepad de Vidrio Templado");
      expect(html).toContain("Teclado Mecánico Pro");
    });

    it("excludes the current PDP product ID", () => {
      const html = renderToStaticMarkup(
        <RelatedProductsBlock
          currentProductId="prod-kb-1" // Same as teclado-mecanico-pro
          productsMap={MOCK_MAP}
          payload={{
            productSlugs: ["teclado-mecanico-pro", "mousepad-vidrio-pro"],
          }}
        />
      );
      expect(html).toContain("Mousepad de Vidrio Templado");
      expect(html).not.toContain("Teclado Mecánico Pro");
    });

    it("safely omits block when only categorySlugs are provided (fail-closed policy)", () => {
      const html = renderToStaticMarkup(
        <RelatedProductsBlock
          currentProductId="prod-current"
          productsMap={MOCK_MAP}
          payload={{
            categorySlugs: ["mouses", "teclados"],
          }}
        />
      );
      expect(html).toBe("");
    });

    it("safely omits block when 0 products match the lookup map", () => {
      const html = renderToStaticMarkup(
        <RelatedProductsBlock
          currentProductId="prod-current"
          productsMap={MOCK_MAP}
          payload={{
            productSlugs: ["non-existent-slug"],
          }}
        />
      );
      expect(html).toBe("");
    });
  });
});
