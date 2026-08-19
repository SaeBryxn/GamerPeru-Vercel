import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import type {
  ProductMediaItem,
  ProductSpecificationDetail,
  ProductVariantDetail,
} from "@/lib/catalog/product-detail-types";
import type { ValidatedSpecificationSchema } from "@/lib/discovery-filters/types";
import {
  CommerceHeroContainer,
  HardwareSpecifications,
  ProductBreadcrumb,
  ProductCommercePanel,
  ProductDetailHero,
  ProductMediaGallery,
  VariantSelector,
  buildEligibleGallery,
  formatSpecFieldValue,
  resolveCanonicalDefaultVariant,
  resolveDefaultFocusedIndex,
  resolveDimensions,
  SWATCH_ALLOWLIST,
  type CommerceHeroProjection,
} from "@/components/product-detail";

const MOCK_VARIANT_1: ProductVariantDetail = {
  id: "var-1",
  productId: "prod-1",
  sku: "WLM-BX-BLK",
  title: "Negro / Omron Optical",
  priceCents: 58900,
  compareAtPriceCents: 64900,
  weightGrams: 39,
  displayOrder: 0,
  status: "ACTIVE",
  attributes: {
    colorway: "Negro",
    switch: "Omron Optical",
  },
};

const MOCK_VARIANT_2: ProductVariantDetail = {
  id: "var-2",
  productId: "prod-1",
  sku: "WLM-BX-WHT",
  title: "Blanco / Huano Blue",
  priceCents: 58900,
  compareAtPriceCents: null,
  weightGrams: 39,
  displayOrder: 1,
  status: "ACTIVE",
  attributes: {
    colorway: "Blanco",
    switch: "Huano Blue",
  },
};

const MOCK_GLOBAL_MEDIA: ProductMediaItem = {
  id: "med-global-1",
  productId: "prod-1",
  mediaAssetId: "asset-global-1",
  variantId: null,
  displayOrder: 0,
  asset: {
    objectKey: "products/wlmouse/hero.webp",
    mimeType: "image/webp",
    fileSizeBytes: 120000,
    width: 800,
    height: 1000,
    altText: "Beast X Pro Hero Global",
  },
};

const MOCK_VARIANT_1_MEDIA: ProductMediaItem = {
  id: "med-v1",
  productId: "prod-1",
  mediaAssetId: "asset-v1",
  variantId: "var-1",
  displayOrder: 1,
  asset: {
    objectKey: "products/wlmouse/var-black.webp",
    mimeType: "image/webp",
    fileSizeBytes: 110000,
    width: 800,
    height: 1000,
    altText: "Beast X Pro Negro",
  },
};

const MOCK_VARIANT_2_MEDIA: ProductMediaItem = {
  id: "med-v2",
  productId: "prod-1",
  mediaAssetId: "asset-v2",
  variantId: "var-2",
  displayOrder: 2,
  asset: {
    objectKey: "products/wlmouse/var-white.webp",
    mimeType: "image/webp",
    fileSizeBytes: 115000,
    width: 800,
    height: 1000,
    altText: "Beast X Pro Blanco",
  },
};

describe("Product Detail Components & Rules (GP-014 DB3B)", () => {
  describe("Default Variant Algorithm (displayOrder -> priceCents -> id)", () => {
    it("selects lowest displayOrder first", () => {
      const vA: ProductVariantDetail = { ...MOCK_VARIANT_1, id: "a", displayOrder: 2 };
      const vB: ProductVariantDetail = { ...MOCK_VARIANT_2, id: "b", displayOrder: 1 };
      expect(resolveCanonicalDefaultVariant([vA, vB])).toBe(vB);
    });

    it("breaks displayOrder ties with lower priceCents", () => {
      const vA: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        id: "a",
        displayOrder: 0,
        priceCents: 64900,
      };
      const vB: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        id: "b",
        displayOrder: 0,
        priceCents: 58900,
      };
      expect(resolveCanonicalDefaultVariant([vA, vB])).toBe(vB);
    });

    it("breaks displayOrder and priceCents ties with lexicographical id", () => {
      const vA: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        id: "variant-z",
        displayOrder: 0,
        priceCents: 58900,
      };
      const vB: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        id: "variant-a",
        displayOrder: 0,
        priceCents: 58900,
      };
      expect(resolveCanonicalDefaultVariant([vA, vB])).toBe(vB);
    });
  });

  describe("Gallery Eligibility, safePrimaryMedia & Focus Precedence", () => {
    it("builds eligible gallery including global and selected-variant media, excluding other variants", () => {
      const allMedia = [MOCK_GLOBAL_MEDIA, MOCK_VARIANT_1_MEDIA, MOCK_VARIANT_2_MEDIA];
      const eligibleForV1 = buildEligibleGallery(allMedia, MOCK_GLOBAL_MEDIA, "var-1");

      expect(eligibleForV1.some((m) => m.id === MOCK_VARIANT_1_MEDIA.id)).toBe(true);
      expect(eligibleForV1.some((m) => m.id === MOCK_GLOBAL_MEDIA.id)).toBe(true);
      expect(eligibleForV1.some((m) => m.id === MOCK_VARIANT_2_MEDIA.id)).toBe(false);
    });

    it("deduplicates media by mediaAssetId when primaryMedia is also in media[]", () => {
      const allMedia = [MOCK_GLOBAL_MEDIA, MOCK_VARIANT_1_MEDIA];
      const eligible = buildEligibleGallery(allMedia, MOCK_GLOBAL_MEDIA, "var-1");
      const assetOccurrences = eligible.filter(
        (m) => m.mediaAssetId === MOCK_GLOBAL_MEDIA.mediaAssetId
      );
      expect(assetOccurrences).toHaveLength(1);
    });

    it("REGRESSION: excludes primaryMedia when primaryMedia.variantId belongs to another variant", () => {
      // Scenario: DB3A fallback sets primaryMedia to Variant 1 media, but Variant 2 is currently selected
      const fallbackPrimaryMedia: ProductMediaItem = { ...MOCK_VARIANT_1_MEDIA };
      const allMedia = [MOCK_GLOBAL_MEDIA, MOCK_VARIANT_1_MEDIA, MOCK_VARIANT_2_MEDIA];

      // When Variant 2 is selected:
      const eligibleForV2 = buildEligibleGallery(allMedia, fallbackPrimaryMedia, "var-2");
      expect(eligibleForV2.some((m) => m.variantId === "var-1")).toBe(false);
      expect(eligibleForV2.some((m) => m.id === MOCK_VARIANT_2_MEDIA.id)).toBe(true);
      expect(eligibleForV2.some((m) => m.id === MOCK_GLOBAL_MEDIA.id)).toBe(true);

      // Focus precedence for V2 resolves to V2 media, NOT V1 fallbackPrimaryMedia
      const focusedIndex = resolveDefaultFocusedIndex(eligibleForV2, fallbackPrimaryMedia, "var-2");
      expect(eligibleForV2[focusedIndex]?.variantId).toBe("var-2");

      // When selected variant changes to Variant 1:
      const eligibleForV1 = buildEligibleGallery(allMedia, fallbackPrimaryMedia, "var-1");
      expect(eligibleForV1.some((m) => m.id === fallbackPrimaryMedia.id)).toBe(true);
      const focusedIndexV1 = resolveDefaultFocusedIndex(
        eligibleForV1,
        fallbackPrimaryMedia,
        "var-1"
      );
      expect(eligibleForV1[focusedIndexV1]?.variantId).toBe("var-1");
    });

    it("prefers selected-variant media first, then safePrimaryMedia, then global media", () => {
      const gallery = [MOCK_GLOBAL_MEDIA, MOCK_VARIANT_1_MEDIA];
      const index = resolveDefaultFocusedIndex(gallery, MOCK_GLOBAL_MEDIA, "var-1");
      expect(gallery[index]?.id).toBe(MOCK_VARIANT_1_MEDIA.id);

      // If selected variant has no specific media, uses safePrimaryMedia
      const globalOnlyGallery = [MOCK_GLOBAL_MEDIA];
      const globalIndex = resolveDefaultFocusedIndex(
        globalOnlyGallery,
        MOCK_GLOBAL_MEDIA,
        "var-999"
      );
      expect(globalOnlyGallery[globalIndex]?.id).toBe(MOCK_GLOBAL_MEDIA.id);
    });
  });

  describe("Generic Dimensions & Color Policy", () => {
    it("extracts valid generic dimension keys and applies colorway > color precedence", () => {
      const v1: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        attributes: { colorway: "Negro", color: "Black", switch: "Optical" },
      };
      const v2: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        attributes: { colorway: "Blanco", color: "White", switch: "Mechanical" },
      };

      const { dimensions, useFallback } = resolveDimensions([v1, v2]);
      expect(useFallback).toBe(false);
      expect(dimensions).toHaveLength(2);
      expect(dimensions[0]?.key).toBe("colorway"); // Color dimension first
      expect(dimensions[1]?.key).toBe("switch"); // Remaining dimensions alphabetical
      expect(dimensions.some((d) => d.key === "color")).toBe(false); // Never render both
    });

    it("preserves remaining valid dimensions when Color modeling is ambiguous", () => {
      // v1 has colorway, v2 has color, but both have unique switch
      const v1: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        attributes: { colorway: "Negro", switch: "Optical" },
      };
      const v2: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        attributes: { color: "Blanco", switch: "Mechanical" },
      };

      const { dimensions, useFallback } = resolveDimensions([v1, v2]);
      expect(useFallback).toBe(false);
      expect(dimensions).toHaveLength(1);
      expect(dimensions[0]?.key).toBe("switch"); // Switch uniquely identifies v1 and v2
    });

    it("falls back to full-title when remaining dimensions cannot uniquely identify variants", () => {
      const v1: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        title: "Negro / 8K",
        attributes: { colorway: "Negro", polling: "8K" },
      };
      const v2: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        title: "Blanco / 8K",
        attributes: { color: "Blanco", polling: "8K" },
      };

      const { dimensions, useFallback } = resolveDimensions([v1, v2]);
      // polling alone is "8K" for both -> ambiguous -> useFallback true!
      expect(useFallback).toBe(true);
      expect(dimensions).toHaveLength(0);
    });

    it("disambiguates duplicate variant titles using public SKU in fallback mode", () => {
      const v1: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        title: "Edición Especial",
        sku: "SKU-ESP-01",
        attributes: {},
      };
      const v2: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        title: "Edición Especial",
        sku: "SKU-ESP-02",
        attributes: {},
      };

      const html = renderToStaticMarkup(
        <VariantSelector variants={[v1, v2]} selectedVariant={v1} onSelectVariant={() => {}} />
      );

      expect(html).toContain("Edición Especial — SKU-ESP-01");
      expect(html).toContain("Edición Especial — SKU-ESP-02");
    });
  });

  describe("Swatch Security Allowlist", () => {
    it("maps approved colors to predefined visual classes", () => {
      expect(SWATCH_ALLOWLIST.negro).toBeDefined();
      expect(SWATCH_ALLOWLIST.blanco).toBeDefined();
      expect(SWATCH_ALLOWLIST.rojo).toBeDefined();
      expect(SWATCH_ALLOWLIST.violeta).toBeDefined();
      expect(SWATCH_ALLOWLIST.plata).toBeDefined();
    });

    it("renders unapproved color values as text chips and NEVER injects CSS styles", () => {
      const v1: ProductVariantDetail = {
        ...MOCK_VARIANT_1,
        attributes: { colorway: "Cyber Pink", switch: "Optical" },
      };
      const v2: ProductVariantDetail = {
        ...MOCK_VARIANT_2,
        attributes: { colorway: "Neon Yellow", switch: "Optical" },
      };

      const html = renderToStaticMarkup(
        <VariantSelector variants={[v1, v2]} selectedVariant={v1} onSelectVariant={() => {}} />
      );

      expect(html).toContain("Cyber Pink");
      expect(html).toContain("Neon Yellow");
      // No arbitrary style injection
      expect(html).not.toContain("style=");
      expect(html).not.toContain("background:");
    });
  });

  describe("Hardware Specifications Runtime Safety", () => {
    const mockSchema: ValidatedSpecificationSchema = {
      id: "schema-1",
      categoryId: "cat-1",
      schemaVersion: 1,
      fieldDefinitions: [
        {
          key: "weight",
          label: "Peso",
          dataType: "number",
          unit: "g",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "peso",
          displayOrder: 0,
        },
        {
          key: "sensor",
          label: "Sensor Óptico",
          dataType: "enum",
          options: [
            { value: "PAW3950", label: "PixArt PAW3950" },
            { value: "PAW3395", label: "PixArt PAW3395" },
          ],
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "sensor",
          displayOrder: 1,
        },
        {
          key: "wireless",
          label: "Inalámbrico",
          dataType: "boolean",
          filterable: true,
          filterKind: "BOOLEAN",
          publicParam: "inalambrico",
          displayOrder: 2,
        },
        {
          key: "mcu",
          label: "Microcontrolador",
          dataType: "string",
          filterable: false,
          filterKind: "ENUM_MULTI",
          publicParam: "mcu",
          displayOrder: 3,
        },
      ],
    };

    it("formats valid specifications matching lowercase data types", () => {
      const specDetail: ProductSpecificationDetail = {
        id: "spec-1",
        productId: "prod-1",
        schemaId: "schema-1",
        schemaVersion: 1,
        schema: mockSchema,
        specValues: {
          weight: 39,
          sensor: "PAW3950",
          wireless: true,
          mcu: "Nordic 52840",
        },
      };

      const html = renderToStaticMarkup(<HardwareSpecifications specifications={specDetail} />);
      expect(html).toContain("Especificaciones Técnicas");
      expect(html).toContain("Peso");
      expect(html).toContain("39 g");
      expect(html).toContain("PixArt PAW3950");
      expect(html).toContain("Inalámbrico");
      expect(html).toContain("Sí");
      expect(html).toContain("Nordic 52840");
    });

    it("safely omits malformed specValues (NaN, unlisted enum, objects, arrays) without throwing", () => {
      const specDetail: ProductSpecificationDetail = {
        id: "spec-1",
        productId: "prod-1",
        schemaId: "schema-1",
        schemaVersion: 1,
        schema: mockSchema,
        specValues: {
          weight: NaN, // Malformed number
          sensor: "UNKNOWN_SENSOR_INCONSISTENT", // Unlisted enum
          wireless: "not_a_boolean", // Malformed boolean
          mcu: { malicious: "object" }, // Malformed object
          unlistedKey: "HACK_ATTEMPT", // Unlisted key
        },
      };

      expect(() => {
        const html = renderToStaticMarkup(<HardwareSpecifications specifications={specDetail} />);
        expect(html).not.toContain("[object Object]");
        expect(html).not.toContain("HACK_ATTEMPT");
        expect(html).not.toContain("UNKNOWN_SENSOR_INCONSISTENT");
      }).not.toThrow();
    });
  });

  describe("ProductCommercePanel & Public Safety", () => {
    it("renders selling price in Soles and compare-at discount when valid", () => {
      const html = renderToStaticMarkup(
        <ProductCommercePanel
          product={{ id: "prod-1", name: "Beast X Pro", subtitle: "Mouse de Magnesio" }}
          brand={{ name: "WLMOUSE", slug: "wlmouse" }}
          variants={[MOCK_VARIANT_1, MOCK_VARIANT_2]}
          selectedVariant={MOCK_VARIANT_1}
          onSelectVariant={() => {}}
        />
      );

      expect(html).toContain("Beast X Pro");
      expect(html).toContain("Mouse de Magnesio");
      expect(html).toContain("WLMOUSE");
      expect(html).toContain("S/ 589.00");
      expect(html).toContain("S/ 649.00");
      expect(html).toContain("-9%");
      expect(html).toContain("SKU: WLM-BX-BLK");
      expect(html).toContain("Peso: 39 g");
      expect(html).toContain("Pago Seguro en Soles");
    });

    it("omits compare-at price when compareAtPriceCents is null or <= priceCents", () => {
      const html = renderToStaticMarkup(
        <ProductCommercePanel
          product={{ id: "prod-1", name: "Beast X Pro", subtitle: null }}
          brand={{ name: "WLMOUSE", slug: "wlmouse" }}
          variants={[MOCK_VARIANT_2]}
          selectedVariant={MOCK_VARIANT_2} // compareAtPriceCents is null
          onSelectVariant={() => {}}
        />
      );

      expect(html).toContain("S/ 589.00");
      expect(html).not.toContain("discount-badge");
    });

    it("NEVER renders costCents or internal cost data", () => {
      const html = renderToStaticMarkup(
        <ProductCommercePanel
          product={{ id: "prod-1", name: "Beast X Pro", subtitle: null }}
          brand={{ name: "WLMOUSE", slug: "wlmouse" }}
          variants={[MOCK_VARIANT_1]}
          selectedVariant={MOCK_VARIANT_1}
          onSelectVariant={() => {}}
        />
      );

      expect(html).not.toContain("cost");
      expect(html).not.toContain("costCents");
      expect(html).not.toContain("cost_cents");
    });

    it("NEVER renders stock claims or delivery estimates", () => {
      const html = renderToStaticMarkup(
        <ProductCommercePanel
          product={{ id: "prod-1", name: "Beast X Pro", subtitle: null }}
          brand={{ name: "WLMOUSE", slug: "wlmouse" }}
          variants={[MOCK_VARIANT_1]}
          selectedVariant={MOCK_VARIANT_1}
          onSelectVariant={() => {}}
        />
      );

      expect(html).not.toContain("En stock");
      expect(html).not.toContain("Sin stock");
      expect(html).not.toContain("Últimas unidades");
      expect(html).not.toContain("Llega mañana");
    });
  });

  describe("ProductBreadcrumb", () => {
    it("renders semantic accessible navigation breadcrumbs", () => {
      const html = renderToStaticMarkup(
        <ProductBreadcrumb
          category={{ name: "Mouses Gaming", slug: "mouses" }}
          productName="Beast X Pro"
        />
      );

      expect(html).toContain('<nav class="');
      expect(html).toContain('aria-label="Breadcrumb"');
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/categorias/mouses"');
      expect(html).toContain("Beast X Pro");
    });
  });

  describe("CommerceHeroProjection Boundary Isolation", () => {
    it("renders ProductDetailHero and ProductMediaGallery with narrow projection without requiring story or specifications", () => {
      const projection: CommerceHeroProjection = {
        product: { id: "prod-1", name: "Beast X Pro", subtitle: null },
        brand: { name: "WLMOUSE", slug: "wlmouse" },
        variants: [MOCK_VARIANT_1, MOCK_VARIANT_2],
        primaryMedia: MOCK_GLOBAL_MEDIA,
        media: [MOCK_GLOBAL_MEDIA, MOCK_VARIANT_1_MEDIA, MOCK_VARIANT_2_MEDIA],
      };

      const heroHtml = renderToStaticMarkup(<ProductDetailHero projection={projection} />);
      expect(heroHtml).toContain("Beast X Pro");
      expect(heroHtml).toContain("WLMOUSE");
      expect(heroHtml).toContain("S/ 589.00");

      const galleryHtml = renderToStaticMarkup(
        <ProductMediaGallery
          media={projection.media}
          primaryMedia={projection.primaryMedia}
          selectedVariant={MOCK_VARIANT_1}
          productName="Beast X Pro"
          brandName="WLMOUSE"
        />
      );
      expect(galleryHtml).toContain("product-media-gallery");

      const containerHtml = renderToStaticMarkup(<CommerceHeroContainer projection={projection} />);
      expect(containerHtml).toContain("Beast X Pro");
    });

    it("exercises formatSpecFieldValue helper for all data types", () => {
      const numField = {
        key: "weight",
        label: "Peso",
        dataType: "number" as const,
        unit: "g",
        filterable: true,
        filterKind: "NUMBER_RANGE" as const,
        publicParam: "peso",
        displayOrder: 0,
      };
      expect(formatSpecFieldValue(numField, 39)).toBe("39 g");
      expect(formatSpecFieldValue(numField, null)).toBeNull();

      const boolField = {
        key: "wireless",
        label: "Inalámbrico",
        dataType: "boolean" as const,
        filterable: true,
        filterKind: "BOOLEAN" as const,
        publicParam: "inalambrico",
        displayOrder: 1,
      };
      expect(formatSpecFieldValue(boolField, true)).toBe("Sí");
      expect(formatSpecFieldValue(boolField, false)).toBe("No");

      const strField = {
        key: "mcu",
        label: "MCU",
        dataType: "string" as const,
        filterable: false,
        filterKind: "ENUM_MULTI" as const,
        publicParam: "mcu",
        displayOrder: 2,
      };
      expect(formatSpecFieldValue(strField, "Nordic 52840")).toBe("Nordic 52840");
      expect(formatSpecFieldValue(strField, "   ")).toBeNull();
    });
  });

  describe("Non-Cartesian Sparse Matrix Combination Compatibility", () => {
    // Sparse matrix fixture:
    // V1: Negro / 8K
    // V2: Negro / 1K
    // V3: Blanco / 1K
    const vSparse1: ProductVariantDetail = {
      id: "v-sparse-1",
      productId: "p1",
      sku: "SKU-BLK-8K",
      title: "Negro / 8K",
      priceCents: 59900,
      compareAtPriceCents: null,
      weightGrams: 39,
      displayOrder: 1,
      status: "ACTIVE",
      attributes: {
        colorway: "Negro",
        polling: "8K",
      },
    };
    const vSparse2: ProductVariantDetail = {
      id: "v-sparse-2",
      productId: "p1",
      sku: "SKU-BLK-1K",
      title: "Negro / 1K",
      priceCents: 49900,
      compareAtPriceCents: null,
      weightGrams: 39,
      displayOrder: 2,
      status: "ACTIVE",
      attributes: {
        colorway: "Negro",
        polling: "1K",
      },
    };
    const vSparse3: ProductVariantDetail = {
      id: "v-sparse-3",
      productId: "p1",
      sku: "SKU-WHT-1K",
      title: "Blanco / 1K",
      priceCents: 49900,
      compareAtPriceCents: null,
      weightGrams: 39,
      displayOrder: 3,
      status: "ACTIVE",
      attributes: {
        colorway: "Blanco",
        polling: "1K",
      },
    };

    const sparseVariants = [vSparse1, vSparse2, vSparse3];

    it("disables Blanco when Negro / 8K is selected because Blanco / 8K does not exist", () => {
      const html = renderToStaticMarkup(
        <VariantSelector
          variants={sparseVariants}
          selectedVariant={vSparse1} // Negro / 8K
          onSelectVariant={() => {}}
        />
      );

      // In colorway dimension: Blanco must be disabled and aria-label indicates (No disponible)
      expect(html).toContain('aria-label="Blanco (No disponible)"');
      expect(html).toMatch(/disabled=""[^>]*data-testid="swatch-option-Blanco"/);

      // In polling dimension: 1K is enabled (because Negro / 1K exists)
      expect(html).toContain('data-testid="dimension-option-polling-1K"');
      expect(html).not.toMatch(/disabled=""[^>]*data-testid="dimension-option-polling-1K"/);
    });

    it("enables Blanco when Negro / 1K is selected because Blanco / 1K exists", () => {
      const html = renderToStaticMarkup(
        <VariantSelector
          variants={sparseVariants}
          selectedVariant={vSparse2} // Negro / 1K
          onSelectVariant={() => {}}
        />
      );

      // In colorway dimension: Blanco is enabled!
      expect(html).toContain('aria-label="Blanco"');
      expect(html).not.toMatch(/disabled=""[^>]*data-testid="swatch-option-Blanco"/);

      // In polling dimension: 8K is enabled (because Negro / 8K exists)
      expect(html).not.toMatch(/disabled=""[^>]*data-testid="dimension-option-polling-8K"/);
    });
  });

  describe("MIME / Media-Type Classification & Video Rendering", () => {
    const videoMedia: ProductMediaItem = {
      id: "med-video-1",
      productId: "prod-1",
      mediaAssetId: "asset-video-1",
      variantId: null,
      displayOrder: 3,
      asset: {
        objectKey: "products/wlmouse/sound-test.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 1048576,
        width: 1920,
        height: 1080,
        altText: "Beast X Pro Switch Sound Test",
      },
    };

    const docMedia: ProductMediaItem = {
      id: "med-doc-1",
      productId: "prod-1",
      mediaAssetId: "asset-doc-1",
      variantId: null,
      displayOrder: 4,
      asset: {
        objectKey: "products/wlmouse/manual.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 524288,
        width: null,
        height: null,
        altText: "User Manual PDF",
      },
    };

    it("includes VIDEO in eligible gallery and omits DOCUMENT media", () => {
      const allMedia = [MOCK_GLOBAL_MEDIA, videoMedia, docMedia];
      const eligible = buildEligibleGallery(allMedia, MOCK_GLOBAL_MEDIA, "var-1");

      expect(eligible.some((m) => m.id === MOCK_GLOBAL_MEDIA.id)).toBe(true);
      expect(eligible.some((m) => m.id === videoMedia.id)).toBe(true);
      // PDF Document is completely omitted from storefront PDP gallery
      expect(eligible.some((m) => m.id === docMedia.id)).toBe(false);
    });

    it("renders <video> element with controls and playsInline when VIDEO media is active", () => {
      const html = renderToStaticMarkup(
        <ProductMediaGallery
          media={[videoMedia]}
          primaryMedia={null}
          selectedVariant={MOCK_VARIANT_1}
          productName="Beast X Pro"
          brandName="WLMOUSE"
        />
      );

      expect(html).toContain("<video");
      expect(html).toContain("controls");
      expect(html.toLowerCase()).toContain("playsinline");
      expect(html).toContain('preload="metadata"');
      expect(html).toContain('data-testid="gallery-video-player"');
      // Must not render <img> for video media
      expect(html).not.toContain("<img");
    });

    it("ignores unsupported primaryMedia (e.g. PDF) without displacing valid supported images", () => {
      const allMedia = [MOCK_GLOBAL_MEDIA];
      // primaryMedia has unsupported PDF MIME
      const eligible = buildEligibleGallery(allMedia, docMedia, "var-1");
      expect(eligible).toHaveLength(1);
      expect(eligible[0]?.id).toBe(MOCK_GLOBAL_MEDIA.id);
    });
  });
});
