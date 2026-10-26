import { describe, expect, it } from "vitest";
import {
  buildProductMetadata,
  buildProductStructuredData,
  normalizeSeoText,
  resolveProductDescription,
  resolveProductSocialImage,
  serializeJsonLd,
} from "@/lib/catalog/pdp-seo";
import type { ProductDetailEntity, ProductMediaItem } from "@/lib/catalog/product-detail-types";

function createMockProduct(overrides: Partial<ProductDetailEntity> = {}): ProductDetailEntity {
  return {
    id: "018f0000-0000-7000-8000-000000000001",
    name: "Mouse Pro Mod 01",
    slug: "mouse-pro-mod-01",
    subtitle: "Mouse ultraligero de magnesio para esports",
    description: "Diseñado para competencia profesional con sensor óptico de alta precisión.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    brand: {
      id: "brand-01",
      name: "WLmouse",
      slug: "wlmouse",
      description: "Marca premium de periféricos",
      logo: null,
    },
    category: {
      id: "cat-01",
      name: "Mouses",
      slug: "mouses",
      description: "Mouses para gaming",
    },
    primaryMedia: {
      id: "med-01",
      productId: "018f0000-0000-7000-8000-000000000001",
      mediaAssetId: "asset-01",
      variantId: null,
      displayOrder: 0,
      asset: {
        objectKey: "products/mouse-pro-mod-01/hero.png",
        mimeType: "image/png",
        fileSizeBytes: 102400,
        width: 1200,
        height: 800,
        altText: "Mouse Pro Mod 01 Vista Frontal",
      },
    },
    variants: [
      {
        id: "var-01",
        productId: "018f0000-0000-7000-8000-000000000001",
        sku: "MPM-BLK",
        title: "Negro",
        priceCents: 12990,
        compareAtPriceCents: null,
        weightGrams: 39,
        displayOrder: 0,
        status: "ACTIVE",
        attributes: { color: "Negro" },
      },
      {
        id: "var-02",
        productId: "018f0000-0000-7000-8000-000000000001",
        sku: "MPM-WHT",
        title: "Blanco",
        priceCents: 12990,
        compareAtPriceCents: null,
        weightGrams: 39,
        displayOrder: 1,
        status: "ACTIVE",
        attributes: { color: "Blanco" },
      },
    ],
    media: [
      {
        id: "med-01",
        productId: "018f0000-0000-7000-8000-000000000001",
        mediaAssetId: "asset-01",
        variantId: null,
        displayOrder: 0,
        asset: {
          objectKey: "products/mouse-pro-mod-01/hero.png",
          mimeType: "image/png",
          fileSizeBytes: 102400,
          width: 1200,
          height: 800,
          altText: "Mouse Pro Mod 01 Vista Frontal",
        },
      },
    ],
    specifications: null,
    story: null,
    ...overrides,
  };
}

describe("GP-014 DB3D — Product SEO & Structured Data Suite", () => {
  describe("Text & Description Normalization", () => {
    it("collapses whitespace and limits length to <= 160 characters", () => {
      const longText =
        "  Este  es un texto   con múltiples   espacios  y saltos\n\nde línea  " + "a".repeat(200);
      const normalized = normalizeSeoText(longText, 160);
      expect(normalized.length).toBeLessThanOrEqual(160);
      expect(normalized).not.toContain("  ");
      expect(normalized).not.toContain("\n");
      expect(normalized.endsWith(" ")).toBe(false);
    });

    it("prefers non-empty subtitle over description", () => {
      const product = createMockProduct({
        subtitle: "Subtítulo editorial destacado",
        description: "Descripción larga del producto",
      });
      expect(resolveProductDescription(product)).toBe("Subtítulo editorial destacado");
    });

    it("falls back to description when subtitle is empty or null", () => {
      const product = createMockProduct({
        subtitle: "   ",
        description: "Descripción larga del producto",
      });
      expect(resolveProductDescription(product)).toBe("Descripción larga del producto");
    });

    it("uses neutral deterministic fallback when subtitle and description are absent", () => {
      const product = createMockProduct({
        name: "Teclado Custom 75%",
        subtitle: null,
        description: null,
        brand: {
          id: "brand-02",
          name: "Akko",
          slug: "akko",
          description: null,
          logo: null,
        },
      });
      const fallback = resolveProductDescription(product);
      expect(fallback).toBe(
        "Conoce Teclado Custom 75% de Akko en Gamer Perú. Revisa sus características, variantes y precio en soles."
      );
      // Verify no fabricated claims in fallback
      expect(fallback.toLowerCase()).not.toContain("garantía");
      expect(fallback.toLowerCase()).not.toContain("envío");
      expect(fallback.toLowerCase()).not.toContain("stock");
      expect(fallback.toLowerCase()).not.toContain("descuento");
    });

    it("bounds neutral deterministic fallback to <= 160 characters when product/brand names are long", () => {
      const product = createMockProduct({
        name: "Mouse Gaming Pro Ultraligero Magnesium Edición Especial Torneo 2026 Con Sensor Óptico Avanzado Y Switches Ópticos De Respuesta Inmediata Para Competencia Profesional En Deportes Electrónicos",
        subtitle: null,
        description: null,
        brand: {
          id: "brand-long",
          name: "WLmouse Esports Engineering Corporation Global International",
          slug: "wlmouse-esports-engineering-corporation-global-international",
          description: null,
          logo: null,
        },
      });
      const fallback = resolveProductDescription(product);
      expect(fallback.length).toBeLessThanOrEqual(160);
      expect(fallback.endsWith(" ")).toBe(false);
      expect(fallback).toBe(
        "Conoce Mouse Gaming Pro Ultraligero Magnesium Edición Especial Torneo 2026 Con Sensor Óptico Avanzado Y Switches Ópticos De Respuesta Inmediata Para Competencia"
      );
      // Verify no fabricated claims in fallback
      expect(fallback.toLowerCase()).not.toContain("garantía");
      expect(fallback.toLowerCase()).not.toContain("envío");
      expect(fallback.toLowerCase()).not.toContain("stock");
      expect(fallback.toLowerCase()).not.toContain("descuento");
    });
  });

  describe("Metadata Builder & Canonical Origin", () => {
    it("generates deterministic title matching '${product.name} — ${product.brand.name} | Gamer Perú'", () => {
      const product = createMockProduct();
      const metadata = buildProductMetadata(product);
      expect(metadata.title).toBe("Mouse Pro Mod 01 — WLmouse | Gamer Perú");
    });

    it("sets canonical URL strictly to production origin 'https://gamerperu.com/productos/[slug]'", () => {
      const product = createMockProduct({ slug: "mouse-pro-mod-01" });
      const metadata = buildProductMetadata(product);
      expect(metadata.alternates?.canonical).toBe(
        "https://gamerperu.com/productos/mouse-pro-mod-01"
      );
    });

    it("sets OpenGraph metadata with siteName, locale, type=website, and matching URL", () => {
      const product = createMockProduct();
      const metadata = buildProductMetadata(product);
      const og = metadata.openGraph as Record<string, unknown>;
      expect(og).toBeDefined();
      expect(og.title).toBe("Mouse Pro Mod 01 — WLmouse | Gamer Perú");
      expect(og.siteName).toBe("Gamer Perú");
      expect(og.locale).toBe("es_PE");
      expect(og.type).toBe("website");
      expect(og.url).toBe("https://gamerperu.com/productos/mouse-pro-mod-01");
    });

    it("sets robots index=true and follow=true for eligible published product", () => {
      const product = createMockProduct();
      const metadata = buildProductMetadata(product);
      expect(metadata.robots).toEqual({ index: true, follow: true });
    });
  });

  describe("Social Image Authority & Amendment B Compliance", () => {
    it("A: uses global primary IMAGE asset and absolutizes relative media URL", () => {
      const product = createMockProduct({
        primaryMedia: {
          id: "med-01",
          productId: "p1",
          mediaAssetId: "a1",
          variantId: null,
          displayOrder: 0,
          asset: {
            objectKey: "products/mouse/hero.png",
            mimeType: "image/png",
            fileSizeBytes: 50000,
            width: 1920,
            height: 1080,
            altText: "Hero Image",
          },
        },
      });
      const img = resolveProductSocialImage(product);
      expect(img).not.toBeNull();
      expect(img?.url).toBe("https://gamerperu.com/media/products/mouse/hero.png");
      expect(img?.alt).toBe("Hero Image");
      expect(img?.width).toBe(1920);
      expect(img?.height).toBe(1080);
    });

    it("B: skips primaryMedia if it is a VIDEO", () => {
      const product = createMockProduct({
        primaryMedia: {
          id: "med-vid",
          productId: "p1",
          mediaAssetId: "a-vid",
          variantId: null,
          displayOrder: 0,
          asset: {
            objectKey: "products/mouse/hero-video.mp4",
            mimeType: "video/mp4",
            fileSizeBytes: 5000000,
            width: 1920,
            height: 1080,
            altText: null,
          },
        },
        media: [],
      });
      const img = resolveProductSocialImage(product);
      expect(img).toBeNull();
    });

    it("C: strictly rejects variant-specific primaryMedia (variantId !== null)", () => {
      const product = createMockProduct({
        primaryMedia: {
          id: "med-var",
          productId: "p1",
          mediaAssetId: "a-var",
          variantId: "var-black-01",
          displayOrder: 0,
          asset: {
            objectKey: "products/mouse/variant-black.png",
            mimeType: "image/png",
            fileSizeBytes: 50000,
            width: 800,
            height: 800,
            altText: "Variant Black",
          },
        },
        media: [],
      });
      const img = resolveProductSocialImage(product);
      expect(img).toBeNull();
    });

    it("D: falls back to first global image in product.media when primary is variant-specific", () => {
      const globalMediaItem: ProductMediaItem = {
        id: "med-global",
        productId: "p1",
        mediaAssetId: "a-glob",
        variantId: null,
        displayOrder: 1,
        asset: {
          objectKey: "products/mouse/global-gallery.png",
          mimeType: "image/png",
          fileSizeBytes: 60000,
          width: 1200,
          height: 800,
          altText: "Global Gallery Image",
        },
      };

      const product = createMockProduct({
        primaryMedia: {
          id: "med-var",
          productId: "p1",
          mediaAssetId: "a-var",
          variantId: "var-01",
          displayOrder: 0,
          asset: {
            objectKey: "products/mouse/variant.png",
            mimeType: "image/png",
            fileSizeBytes: 50000,
            width: 800,
            height: 800,
            altText: null,
          },
        },
        media: [
          {
            id: "med-var-2",
            productId: "p1",
            mediaAssetId: "a-var-2",
            variantId: "var-02",
            displayOrder: 0,
            asset: {
              objectKey: "products/mouse/variant2.png",
              mimeType: "image/png",
              fileSizeBytes: 50000,
              width: 800,
              height: 800,
              altText: null,
            },
          },
          globalMediaItem,
        ],
      });

      const img = resolveProductSocialImage(product);
      expect(img).not.toBeNull();
      expect(img?.url).toBe("https://gamerperu.com/media/products/mouse/global-gallery.png");
      expect(img?.alt).toBe("Global Gallery Image");
    });

    it("E: omits image when only variant-specific images exist", () => {
      const product = createMockProduct({
        primaryMedia: null,
        media: [
          {
            id: "med-var-1",
            productId: "p1",
            mediaAssetId: "a1",
            variantId: "var-01",
            displayOrder: 0,
            asset: {
              objectKey: "products/mouse/variant1.png",
              mimeType: "image/png",
              fileSizeBytes: 50000,
              width: 800,
              height: 800,
              altText: null,
            },
          },
        ],
      });
      const img = resolveProductSocialImage(product);
      expect(img).toBeNull();

      const metadata = buildProductMetadata(product);
      expect(metadata.openGraph?.images).toBeUndefined();

      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const productNode = graph.find((n) => n["@type"] === "Product");
      expect(productNode?.image).toBeUndefined();
    });

    it("adds AggregateRating only when approved reviews exist", () => {
      const product = createMockProduct({});
      const nodeFor = (rating?: { average: number | null; count: number }) =>
        (
          buildProductStructuredData(product, rating)?.["@graph"] as Array<Record<string, unknown>>
        ).find((n) => n["@type"] === "Product");

      expect(nodeFor()?.aggregateRating).toBeUndefined();
      expect(nodeFor({ average: null, count: 0 })?.aggregateRating).toBeUndefined();
      expect(nodeFor({ average: 4.5, count: 12 })?.aggregateRating).toEqual({
        "@type": "AggregateRating",
        ratingValue: "4.5",
        reviewCount: 12,
        bestRating: "5",
        worstRating: "1",
      });
    });

    it("F: gracefully omits image on malicious path traversal objectKey", () => {
      const product = createMockProduct({
        primaryMedia: {
          id: "med-bad",
          productId: "p1",
          mediaAssetId: "a-bad",
          variantId: null,
          displayOrder: 0,
          asset: {
            objectKey: "../../../etc/passwd",
            mimeType: "image/png",
            fileSizeBytes: 100,
            width: 100,
            height: 100,
            altText: null,
          },
        },
        media: [],
      });
      const img = resolveProductSocialImage(product);
      expect(img).toBeNull();
    });
  });

  describe("Product JSON-LD & Canonical Offer Policy", () => {
    it("UNIFORM PRICE: emits single Offer when all active variants have identical price", () => {
      const product = createMockProduct({
        variants: [
          {
            id: "v1",
            productId: "p1",
            sku: "SKU-1",
            title: "Negro",
            priceCents: 12990,
            compareAtPriceCents: 15990, // compareAt MUST NOT be emitted
            weightGrams: 39,
            displayOrder: 0,
            status: "ACTIVE",
            attributes: {},
          },
          {
            id: "v2",
            productId: "p1",
            sku: "SKU-2",
            title: "Blanco",
            priceCents: 12990,
            compareAtPriceCents: null,
            weightGrams: 39,
            displayOrder: 1,
            status: "ACTIVE",
            attributes: {},
          },
        ],
      });

      const structured = buildProductStructuredData(product);
      expect(structured).not.toBeNull();
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const productNode = graph.find((n) => n["@type"] === "Product");
      expect(productNode).toBeDefined();

      const offers = productNode?.offers as Record<string, unknown>;
      expect(offers).toBeDefined();
      expect(offers["@type"]).toBe("Offer");
      expect(offers.price).toBe("129.90");
      expect(offers.priceCurrency).toBe("PEN");
      expect(offers.url).toBe("https://gamerperu.com/productos/mouse-pro-mod-01");

      // Availability, inventory, and compareAt MUST BE ABSENT
      expect(offers.availability).toBeUndefined();
      expect(offers.inventoryLevel).toBeUndefined();
      expect(offers.offerCount).toBeUndefined();
      expect(offers.lowPrice).toBeUndefined();
      expect(offers.highPrice).toBeUndefined();
      expect(offers.compareAtPrice).toBeUndefined();
    });

    it("VARIABLE PRICE: strictly OMITS Product.offers when active variants have differing prices", () => {
      const product = createMockProduct({
        variants: [
          {
            id: "v1",
            productId: "p1",
            sku: "SKU-1",
            title: "Negro 4K",
            priceCents: 12990,
            compareAtPriceCents: null,
            weightGrams: 39,
            displayOrder: 0,
            status: "ACTIVE",
            attributes: {},
          },
          {
            id: "v2",
            productId: "p1",
            sku: "SKU-2",
            title: "Negro 8K",
            priceCents: 14990,
            compareAtPriceCents: null,
            weightGrams: 39,
            displayOrder: 1,
            status: "ACTIVE",
            attributes: {},
          },
        ],
      });

      const structured = buildProductStructuredData(product);
      expect(structured).not.toBeNull();
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const productNode = graph.find((n) => n["@type"] === "Product");
      expect(productNode).toBeDefined();

      // Product.offers MUST be undefined
      expect(productNode?.offers).toBeUndefined();

      // Verify no forbidden AggregateOffer or range structures
      expect(productNode?.aggregateOffer).toBeUndefined();
      expect(productNode?.lowPrice).toBeUndefined();
      expect(productNode?.highPrice).toBeUndefined();
      expect(productNode?.hasVariant).toBeUndefined();
    });

    it("FORBIDDEN COMMERCIAL FIELDS: verifies zero fabrication of ratings, reviews, shipping, warranty, cost", () => {
      const product = createMockProduct();
      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const productNode = graph.find((n) => n["@type"] === "Product");

      expect(productNode?.aggregateRating).toBeUndefined();
      expect(productNode?.review).toBeUndefined();
      expect(productNode?.shippingDetails).toBeUndefined();
      expect(productNode?.hasMerchantReturnPolicy).toBeUndefined();
      expect(productNode?.warranty).toBeUndefined();
      expect(productNode?.costCents).toBeUndefined();
      expect(productNode?.cost).toBeUndefined();
      expect(productNode?.inventory).toBeUndefined();
    });
  });

  describe("BreadcrumbList JSON-LD", () => {
    it("emits 3-level breadcrumb (Inicio -> Category -> Product) with exact canonical URLs", () => {
      const product = createMockProduct({
        slug: "teclado-pro",
        name: "Teclado Pro",
        category: {
          id: "cat-02",
          name: "Teclados",
          slug: "teclados",
          description: null,
        },
      });

      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const breadcrumbNode = graph.find((n) => n["@type"] === "BreadcrumbList");

      expect(breadcrumbNode).toBeDefined();
      const items = breadcrumbNode?.itemListElement as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);

      expect(items[0]).toEqual({
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: "https://gamerperu.com/",
      });

      expect(items[1]).toEqual({
        "@type": "ListItem",
        position: 2,
        name: "Teclados",
        item: "https://gamerperu.com/categorias/teclados",
      });

      expect(items[2]).toEqual({
        "@type": "ListItem",
        position: 3,
        name: "Teclado Pro",
        item: "https://gamerperu.com/productos/teclado-pro",
      });
    });
  });

  describe("FAQPage JSON-LD & Semantic Parity", () => {
    it("omits FAQPage when product has no story", () => {
      const product = createMockProduct({ story: null });
      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      expect(graph.find((n) => n["@type"] === "FAQPage")).toBeUndefined();
    });

    it("omits FAQPage when story has zero faq blocks", () => {
      const product = createMockProduct({
        story: {
          productId: "p1",
          publishedRevisionId: "rev1",
          revisionNumber: 1,
          publishedAt: "2026-01-01T00:00:00Z",
          blocks: [
            {
              blockId: "blk-hero",
              type: "hero_media",
              order: 1,
              payload: {
                headline: "Hero Title",
                tagline: "Tagline",
                mediaKey: "img.png",
              },
            },
          ],
        },
      });

      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      expect(graph.find((n) => n["@type"] === "FAQPage")).toBeUndefined();
    });

    it("emits FAQPage matching authored questions and answers in document order", () => {
      const product = createMockProduct({
        story: {
          productId: "p1",
          publishedRevisionId: "rev1",
          revisionNumber: 1,
          publishedAt: "2026-01-01T00:00:00Z",
          blocks: [
            {
              blockId: "blk-faq-1",
              type: "faq",
              order: 1,
              payload: {
                title: "Preguntas Frecuentes",
                items: [
                  {
                    question: "¿Qué polling rate soporta?",
                    answer: "Soporta hasta 8000Hz con el receptor 8K.",
                  },
                  {
                    question: "¿Cuál es el peso exacto?",
                    answer: "El peso es de 39 gramos sin receptor.",
                  },
                ],
              },
            },
            {
              blockId: "blk-faq-2",
              type: "faq",
              order: 2,
              payload: {
                title: "Soporte Adicional",
                items: [
                  {
                    question: "¿Tiene software web?",
                    answer: "Sí, cuenta con driver web en línea.",
                  },
                  {
                    question: "¿Qué polling rate soporta?", // Duplicate question preserved without artificial dedup
                    answer: "Soporta 1000Hz a 8000Hz.",
                  },
                ],
              },
            },
          ],
        },
      });

      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const faqNode = graph.find((n) => n["@type"] === "FAQPage");

      expect(faqNode).toBeDefined();
      const mainEntity = faqNode?.mainEntity as Array<Record<string, unknown>>;
      expect(mainEntity).toHaveLength(4);

      expect(mainEntity[0]).toEqual({
        "@type": "Question",
        name: "¿Qué polling rate soporta?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Soporta hasta 8000Hz con el receptor 8K.",
        },
      });

      expect(mainEntity[1]).toEqual({
        "@type": "Question",
        name: "¿Cuál es el peso exacto?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "El peso es de 39 gramos sin receptor.",
        },
      });

      expect(mainEntity[2]).toEqual({
        "@type": "Question",
        name: "¿Tiene software web?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, cuenta con driver web en línea.",
        },
      });

      expect(mainEntity[3]).toEqual({
        "@type": "Question",
        name: "¿Qué polling rate soporta?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Soporta 1000Hz a 8000Hz.",
        },
      });
    });

    it("preserves exact validated FAQ strings without trim mutation (exact parity with visible DTO)", () => {
      const product = createMockProduct({
        story: {
          productId: "p1",
          publishedRevisionId: "rev1",
          revisionNumber: 1,
          publishedAt: "2026-01-01T00:00:00Z",
          blocks: [
            {
              blockId: "blk-faq-exact",
              type: "faq",
              order: 1,
              payload: {
                title: "FAQ Parity",
                items: [
                  {
                    question: "  ¿Qué polling rate soporta?  ",
                    answer: "  Soporta hasta 8000Hz.  ",
                  },
                ],
              },
            },
          ],
        },
      });

      const structured = buildProductStructuredData(product);
      const graph = structured?.["@graph"] as Array<Record<string, unknown>>;
      const faqNode = graph.find((n) => n["@type"] === "FAQPage");

      expect(faqNode).toBeDefined();
      const mainEntity = faqNode?.mainEntity as Array<Record<string, unknown>>;
      expect(mainEntity).toHaveLength(1);

      // Must be EXACTLY the source string without trimming
      expect(mainEntity[0]).toEqual({
        "@type": "Question",
        name: "  ¿Qué polling rate soporta?  ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "  Soporta hasta 8000Hz.  ",
        },
      });
    });
  });

  describe("Safe JSON-LD Serialization & Injection Defense", () => {
    it("escapes script breakout tags and special HTML characters", () => {
      const maliciousData = {
        name: "Mouse</script><script>alert(1)</script>",
        description: "Text with <b>HTML</b> & special chars: < > & \u2028 \u2029",
      };

      const serialized = serializeJsonLd(maliciousData);

      // Must NOT contain literal unescaped </script>
      expect(serialized).not.toContain("</script>");
      expect(serialized).not.toContain("<script>");
      expect(serialized).not.toContain("<b");
      expect(serialized).not.toContain("&");

      // Must contain escaped representations
      expect(serialized).toContain("\\u003c/script\\u003e");
      expect(serialized).toContain("\\u0026");

      // Must parse back cleanly into the exact original text
      const parsed = JSON.parse(serialized);
      expect(parsed.name).toBe("Mouse</script><script>alert(1)</script>");
      expect(parsed.description).toBe("Text with <b>HTML</b> & special chars: < > & \u2028 \u2029");
    });
  });
});
