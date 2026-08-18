import { describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { PostgresProductDetailReader } from "@/lib/catalog/postgres-product-detail-reader";
import { DevCatalogPreviewReader } from "@/lib/catalog/dev-preview-reader";
import { FixtureCatalogDiscoveryReader } from "@/lib/catalog/fixture-reader";
import { getProductDetailReader } from "@/lib/catalog/get-reader";
import { getCachedProduct } from "@/lib/catalog/cached-queries";
import * as postgresDetailQueries from "@/lib/catalog/postgres-product-detail-queries";
import { CANONICAL_STORY_BLOCK_TYPES, validateStoryBlocks } from "@/lib/catalog/story-validation";

describe("GP-014 — Product Detail Reader & Data Layer (DB3A)", () => {
  const mockProductId = "018f0000-0000-7000-8000-000000000p01";
  const mockBrandId = "018f0000-0000-7000-8000-000000000b01";
  const mockCategoryId = "018f0000-0000-7000-8000-000000000c01";
  const mockSchemaId = "018f0000-0000-7000-8000-000000000s01";
  const mockVariant1Id = "018f0000-0000-7000-8000-000000000v01";
  const mockVariant2Id = "018f0000-0000-7000-8000-000000000v02";
  const mockAsset1Id = "018f0000-0000-7000-8000-000000000a01";
  const mockAsset2Id = "018f0000-0000-7000-8000-000000000a02";
  const mockStoryRevId = "018f0000-0000-7000-8000-000000000r01";

  const defaultMockProductBase = {
    id: mockProductId,
    name: "WLMouse Beast X Max",
    slug: "wlmouse-beast-x-max",
    subtitle: "Magnesium Wireless Gaming Mouse",
    description: "Ultra-lightweight magnesium alloy chassis with PAW3950 sensor.",
    primaryMediaId: mockAsset1Id,
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T12:00:00.000Z"),
    brand: {
      id: mockBrandId,
      name: "WLMouse",
      slug: "wlmouse",
      description: "Innovative ultralight magnesium gaming peripherals.",
      logoMediaId: null,
    },
    category: {
      id: mockCategoryId,
      name: "Mouses Gaming",
      slug: "mouses",
      description: "High performance competitive gaming mice.",
      currentSpecSchemaId: mockSchemaId,
    },
  };

  const defaultMockVariants = [
    {
      id: mockVariant1Id,
      productId: mockProductId,
      sku: "WLM-MAX-BLK",
      title: "Metallic Black / 8K",
      priceCents: 59900,
      compareAtPriceCents: 64900,
      weightGrams: 42,
      displayOrder: 1,
      status: "ACTIVE" as const,
      attributes: { color: "Metallic Black", pollingRate: 8000 },
    },
    {
      id: mockVariant2Id,
      productId: mockProductId,
      sku: "WLM-MAX-SLV",
      title: "Silver Edition / 8K",
      priceCents: 61900,
      compareAtPriceCents: null,
      weightGrams: 42,
      displayOrder: 2,
      status: "ACTIVE" as const,
      attributes: { color: "Silver", pollingRate: 8000 },
    },
  ];

  const defaultMockMedia = [
    {
      id: "018f0000-0000-7000-8000-000000000m01",
      productId: mockProductId,
      mediaAssetId: mockAsset1Id,
      variantId: null, // Global
      displayOrder: 1,
      createdAt: new Date("2026-08-18T10:00:00.000Z"),
    },
    {
      id: "018f0000-0000-7000-8000-000000000m02",
      productId: mockProductId,
      mediaAssetId: mockAsset2Id,
      variantId: mockVariant1Id, // Variant specific
      displayOrder: 2,
      createdAt: new Date("2026-08-18T10:05:00.000Z"),
    },
  ];

  const defaultMockAssets = [
    {
      id: mockAsset1Id,
      objectKey: "products/wlmouse-beast-x-max/hero.png",
      mimeType: "image/png",
      fileSizeBytes: 350000,
      width: 1200,
      height: 1200,
      altText: "WLMouse Beast X Max Hero",
      securityClass: "PUBLIC_MEDIA" as const,
    },
    {
      id: mockAsset2Id,
      objectKey: "products/wlmouse-beast-x-max/black.png",
      mimeType: "image/png",
      fileSizeBytes: 320000,
      width: 1200,
      height: 1200,
      altText: "WLMouse Beast X Max Metallic Black",
      securityClass: "PUBLIC_MEDIA" as const,
    },
  ];

  const defaultMockSpec = {
    productId: mockProductId,
    schemaId: mockSchemaId,
    productSchemaVersion: 1,
    categorySchemaVersion: 1,
    specValues: {
      weight_g: 42,
      sensor: "paw3950",
      shape: "simetrico",
      polling_rate_hz: 8000,
    },
    schemaCategoryId: mockCategoryId,
    schemaFieldDefinitions: [
      {
        key: "weight_g",
        label: "Peso",
        dataType: "number",
        unit: "g",
        filterable: true,
        filterKind: "NUMBER_RANGE",
        publicParam: "peso",
        displayOrder: 1,
        min: 30,
        max: 60,
      },
      {
        key: "sensor",
        label: "Sensor",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "sensor",
        displayOrder: 2,
        options: [
          { value: "paw3950", label: "PAW3950" },
          { value: "paw3395", label: "PAW3395" },
        ],
      },
    ],
  };

  const defaultMockStory = {
    productId: mockProductId,
    publishedRevisionId: mockStoryRevId,
    revisionNumber: 1,
    revisionStatus: "PUBLISHED" as const,
    revisionProductId: mockProductId,
    publishedAt: new Date("2026-08-18T11:00:00.000Z"),
    blocks: [
      {
        block_id: "blk-01",
        type: "hero_media",
        order: 1,
        payload: {
          headline: "Magnesium Precision",
          body: "Forged with aerospace-grade magnesium alloy.",
        },
      },
    ],
  };

  function setNodeEnv(value: string): void {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  }

  function setupPostgresMocks(overrides?: {
    productBase?: typeof defaultMockProductBase | null;
    variants?: typeof defaultMockVariants;
    media?: typeof defaultMockMedia;
    assets?: typeof defaultMockAssets;
    spec?: {
      productId: string;
      schemaId: string;
      productSchemaVersion: number;
      categorySchemaVersion: number;
      specValues: Record<string, unknown>;
      schemaCategoryId: string;
      schemaFieldDefinitions: unknown;
    } | null;
    story?: {
      productId: string;
      publishedRevisionId: string | null;
      revisionNumber: number;
      revisionStatus: string;
      revisionProductId: string;
      publishedAt: Date | null;
      blocks: unknown;
    } | null;
  }) {
    vi.restoreAllMocks();
    const base =
      overrides && "productBase" in overrides ? overrides.productBase : defaultMockProductBase;
    const variants = overrides?.variants ?? defaultMockVariants;
    const media = overrides?.media ?? defaultMockMedia;
    const assets = overrides?.assets ?? defaultMockAssets;
    const spec = overrides && "spec" in overrides ? overrides.spec : defaultMockSpec;
    const story = overrides && "story" in overrides ? overrides.story : defaultMockStory;

    const query1Spy = vi
      .spyOn(postgresDetailQueries, "buildPublishedProductBaseBySlugQuery")
      .mockResolvedValue(base ? ([base] as never) : ([] as never));
    const query2Spy = vi
      .spyOn(postgresDetailQueries, "buildActiveProductVariantsByProductIdQuery")
      .mockResolvedValue(variants as never);
    const query3Spy = vi
      .spyOn(postgresDetailQueries, "buildProductMediaByProductIdQuery")
      .mockResolvedValue(media);
    const query4Spy = vi
      .spyOn(postgresDetailQueries, "buildMediaAssetsByIdsQuery")
      .mockResolvedValue(assets);
    const query5Spy = vi
      .spyOn(postgresDetailQueries, "buildProductSpecificationByProductIdQuery")
      .mockResolvedValue(spec ? ([spec] as never) : ([] as never));
    const query6Spy = vi
      .spyOn(postgresDetailQueries, "buildPublishedProductStoryByProductIdQuery")
      .mockResolvedValue(story ? ([story] as never) : ([] as never));

    return {
      query1Spy,
      query2Spy,
      query3Spy,
      query4Spy,
      query5Spy,
      query6Spy,
    };
  }

  // --- Scenario A ---
  it("A: published eligible Product returns complete ProductDetailEntity", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.id).toBe(mockProductId);
    expect(result?.name).toBe("WLMouse Beast X Max");
    expect(result?.slug).toBe("wlmouse-beast-x-max");
    expect(result?.brand.slug).toBe("wlmouse");
    expect(result?.category.slug).toBe("mouses");
    expect(result?.variants).toHaveLength(2);
    expect(result?.media).toHaveLength(2);
    expect(result?.specifications).not.toBeNull();
    expect(result?.specifications?.specValues.sensor).toBe("paw3950");
    expect(result?.story).not.toBeNull();
    expect(result?.story?.revisionNumber).toBe(1);
  });

  // --- Scenario B ---
  it("B: nonexistent slug returns null without server error", async () => {
    setupPostgresMocks({ productBase: null });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("non-existent-product");

    expect(result).toBeNull();
  });

  // --- Scenario C ---
  it("C: DRAFT or unpublished Product returns null", async () => {
    setupPostgresMocks({ productBase: null });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("draft-product");

    expect(result).toBeNull();
  });

  // --- Scenario D ---
  it("D: unpublished Brand causes product query to return null", async () => {
    setupPostgresMocks({ productBase: null });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("product-with-draft-brand");

    expect(result).toBeNull();
  });

  // --- Scenario E ---
  it("E: unpublished Category causes product query to return null", async () => {
    setupPostgresMocks({ productBase: null });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("product-with-draft-category");

    expect(result).toBeNull();
  });

  // --- Scenario F ---
  it("F: Product with zero ACTIVE variants returns null (public eligibility rule)", async () => {
    setupPostgresMocks({ variants: [] });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).toBeNull();
  });

  // --- Scenario G ---
  it("G: inactive variants are filtered out from product detail projection", async () => {
    setupPostgresMocks({
      variants: [defaultMockVariants[0]!], // only 1 active variant returned
    });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.variants).toHaveLength(1);
    expect(result?.variants[0]?.id).toBe(mockVariant1Id);
    expect(result?.variants[0]?.status).toBe("ACTIVE");
  });

  // --- Scenario H (with Remediation A assertions) ---
  it("H: Product Variant price, SKU, displayOrder, attributes project accurately and costCents is NEVER exposed", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    const v1 = result?.variants[0];
    expect(v1?.sku).toBe("WLM-MAX-BLK");
    expect(v1?.priceCents).toBe(59900);
    expect(v1?.compareAtPriceCents).toBe(64900);
    expect(v1?.weightGrams).toBe(42);
    expect(v1?.displayOrder).toBe(1);
    expect(v1?.attributes).toEqual({ color: "Metallic Black", pollingRate: 8000 });

    // Remediation A assertions: wholesale cost must NEVER leak
    expect(v1).not.toHaveProperty("costCents");
    expect(v1).not.toHaveProperty("cost_cents");
    expect((v1 as unknown as Record<string, unknown>).costCents).toBeUndefined();
    expect((v1 as unknown as Record<string, unknown>).cost_cents).toBeUndefined();
  });

  // --- Scenario I ---
  it("I: global ProductMedia (variant_id = NULL) participates in media list", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    const globalMedia = result?.media.find((m) => m.variantId === null);
    expect(globalMedia).toBeDefined();
    expect(globalMedia?.asset.objectKey).toBe("products/wlmouse-beast-x-max/hero.png");
  });

  // --- Scenario J ---
  it("J: valid same-product ACTIVE variant-specific media participates in media list", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    const variantMedia = result?.media.find((m) => m.variantId === mockVariant1Id);
    expect(variantMedia).toBeDefined();
    expect(variantMedia?.asset.objectKey).toBe("products/wlmouse-beast-x-max/black.png");
  });

  // --- Scenario K ---
  it("K: cross-product variant media is excluded and triggers a sanitized warning", async () => {
    const foreignVariantId = "018f0000-0000-7000-8000-foreignvar01";

    setupPostgresMocks({
      media: [
        defaultMockMedia[0]!, // global
        {
          id: "018f0000-0000-7000-8000-mforeign001",
          productId: mockProductId,
          mediaAssetId: mockAsset2Id,
          variantId: foreignVariantId, // cross-product / unknown variant
          displayOrder: 2,
          createdAt: new Date(),
        },
      ],
    });
    const warnSpy = vi.spyOn(logger, "warn");

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    // Only the global media should remain
    expect(result?.media).toHaveLength(1);
    expect(result?.media[0]?.variantId).toBeNull();

    // Verify sanitized logger warning was emitted
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "pdp_invalid_variant_media_dropped",
        productId: mockProductId,
        variantId: foreignVariantId,
      })
    );
  });

  // --- Scenario L ---
  it("L: media referencing an inactive variant is excluded", async () => {
    const inactiveVariantId = mockVariant2Id;

    // Active variants returned only has variant 1
    setupPostgresMocks({
      variants: [defaultMockVariants[0]!],
      media: [
        defaultMockMedia[0]!, // global
        {
          id: "018f0000-0000-7000-8000-minactive001",
          productId: mockProductId,
          mediaAssetId: mockAsset2Id,
          variantId: inactiveVariantId, // inactive variant
          displayOrder: 2,
          createdAt: new Date(),
        },
      ],
    });
    const warnSpy = vi.spyOn(logger, "warn");

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result?.media).toHaveLength(1);
    expect(result?.media[0]?.variantId).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "pdp_invalid_variant_media_dropped",
        productId: mockProductId,
        variantId: inactiveVariantId,
      })
    );
  });

  // --- Scenario M ---
  it("M: malformed variant media is NEVER reinterpreted as global media", async () => {
    setupPostgresMocks({
      media: [
        {
          id: "018f0000-0000-7000-8000-mbadvariant01",
          productId: mockProductId,
          mediaAssetId: mockAsset2Id,
          variantId: "bad-variant-id",
          displayOrder: 1,
          createdAt: new Date(),
        },
      ],
    });

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    // Must be completely empty, not converted to global
    expect(result?.media).toHaveLength(0);
  });

  // --- Scenario N ---
  it("N: valid ProductSpecifications project with full validated schema", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result?.specifications).not.toBeNull();
    expect(result?.specifications?.schema.fieldDefinitions).toHaveLength(2);
    expect(result?.specifications?.specValues.weight_g).toBe(42);
  });

  // --- Scenario O ---
  it("O: malformed specification schema is safely omitted following GP-013 policy", async () => {
    setupPostgresMocks({
      spec: {
        ...defaultMockSpec,
        schemaFieldDefinitions: [
          {
            key: "marca", // reserved param collision!
            label: "Marca",
            dataType: "string",
            filterable: true,
            publicParam: "marca",
          },
        ],
      },
    });

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    // Specifications should be null because schema validation failed safely
    expect(result?.specifications).toBeNull();
  });

  // --- Scenario P ---
  it("P: valid PUBLISHED Story revision participates in ProductDetailEntity with canonical hero_media type", async () => {
    setupPostgresMocks();
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result?.story).not.toBeNull();
    expect(result?.story?.publishedRevisionId).toBe(mockStoryRevId);
    expect(result?.story?.blocks).toHaveLength(1);
    expect(result?.story?.blocks[0]?.type).toBe("hero_media");
    expect(result?.story?.blocks[0]?.blockId).toBe("blk-01");
  });

  // --- Scenario Q ---
  it("Q: null published Story pointer results in story: null without error", async () => {
    setupPostgresMocks({ story: null });
    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.story).toBeNull();
  });

  // --- Scenario R ---
  it("R: non-PUBLISHED referenced Story revision does not participate", async () => {
    setupPostgresMocks({
      story: {
        ...defaultMockStory,
        revisionStatus: "DRAFT" as const, // Not published
      },
    });

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.story).toBeNull();
  });

  // --- Scenario S ---
  it("S: cross-product Story revision pointer results in Story omission, not whole Product failure", async () => {
    const foreignProductId = "018f0000-0000-7000-8000-foreignprod01";

    setupPostgresMocks({
      story: {
        ...defaultMockStory,
        revisionProductId: foreignProductId, // belongs to another product!
      },
    });
    const warnSpy = vi.spyOn(logger, "warn");

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("WLMouse Beast X Max");
    // Story omitted cleanly
    expect(result?.story).toBeNull();

    // Sanitized warning emitted
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "pdp_invalid_published_story_revision_dropped",
        productId: mockProductId,
        revisionProductId: foreignProductId,
      })
    );
  });

  // --- Scenario T ---
  it("T: no draft Story fallback when published revision is invalid", async () => {
    setupPostgresMocks({
      story: {
        ...defaultMockStory,
        publishedAt: null, // invalid published timestamp
      },
    });

    const reader = new PostgresProductDetailReader();
    const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(result).not.toBeNull();
    expect(result?.story).toBeNull();
  });

  // --- Scenario U ---
  it("U: reader mode resolution respects environment guards and fails closed in production", () => {
    const originalEnv = { ...process.env };

    // Mode resolution in test/dev
    process.env.DEV_CATALOG_PREVIEW = "1";
    setNodeEnv("development");
    delete process.env.CI;
    const previewReader = getProductDetailReader();
    expect(previewReader).toBeInstanceOf(DevCatalogPreviewReader);

    // Guard: Ambiguity throws
    process.env.E2E_CATALOG_FIXTURES = "1";
    process.env.DEV_CATALOG_PREVIEW = "1";
    expect(() => getProductDetailReader()).toThrow(/Ambiguous catalog reader configuration/);

    // Restore
    process.env = originalEnv;
  });

  // --- Scenario V ---
  it("V: request-scoped getCachedProduct deduplicates calls within the same cycle", async () => {
    setupPostgresMocks();
    const product1 = await getCachedProduct("wlmouse-beast-x-max");
    const product2 = await getCachedProduct("wlmouse-beast-x-max");

    expect(product1).not.toBeNull();
    expect(product2).not.toBeNull();
    expect(product1?.id).toBe(product2?.id);
  });

  // --- Scenario W ---
  it("W: query count is strictly bounded (<= 6 logical queries per product read)", async () => {
    const { query1Spy, query2Spy, query3Spy, query4Spy, query5Spy, query6Spy } =
      setupPostgresMocks();

    const reader = new PostgresProductDetailReader();
    await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

    expect(query1Spy).toHaveBeenCalledTimes(1);
    expect(query2Spy).toHaveBeenCalledTimes(1);
    expect(query3Spy).toHaveBeenCalledTimes(1);
    expect(query4Spy).toHaveBeenCalledTimes(1);
    expect(query5Spy).toHaveBeenCalledTimes(1);
    expect(query6Spy).toHaveBeenCalledTimes(1);
  });

  // --- Scenario X ---
  it("X: synthetic and fixture readers support product detail and mock edge cases", async () => {
    const fixtureReader = new FixtureCatalogDiscoveryReader();
    const devReader = new DevCatalogPreviewReader();

    // Valid product slug
    const mouse1 = await fixtureReader.getPublishedProductBySlug("mouse-pro-mod-01");
    expect(mouse1).not.toBeNull();
    expect(mouse1?.name).toBe("Mouse Pro Mod 01");
    expect(mouse1?.variants.length).toBeGreaterThan(0);
    expect(mouse1?.media.length).toBeGreaterThan(0);
    expect(mouse1?.specifications).not.toBeNull();
    expect(mouse1?.story).not.toBeNull();

    // Dev preview reader
    const devMouse = await devReader.getPublishedProductBySlug("mouse-pro-mod-01");
    expect(devMouse).not.toBeNull();
    expect(devMouse?.slug).toBe("mouse-pro-mod-01");

    // Edge cases return null
    expect(await fixtureReader.getPublishedProductBySlug("producto-draft")).toBeNull();
    expect(await fixtureReader.getPublishedProductBySlug("producto-marca-draft")).toBeNull();
    expect(await fixtureReader.getPublishedProductBySlug("producto-categoria-draft")).toBeNull();
    expect(await fixtureReader.getPublishedProductBySlug("producto-sin-variantes")).toBeNull();
    expect(await fixtureReader.getPublishedProductBySlug("non-existent-slug")).toBeNull();
  });

  // =========================================================================
  // REMEDIATION REGRESSION TESTS (Findings A, B, C)
  // =========================================================================

  describe("Remediation A — Public Data Safety (costCents absence)", () => {
    it("proves PostgresProductDetailReader variant never exposes costCents or cost_cents", async () => {
      setupPostgresMocks();
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result).not.toBeNull();
      for (const variant of result!.variants) {
        expect(variant).not.toHaveProperty("costCents");
        expect(variant).not.toHaveProperty("cost_cents");
        expect((variant as unknown as Record<string, unknown>).costCents).toBeUndefined();
        expect((variant as unknown as Record<string, unknown>).cost_cents).toBeUndefined();
      }
    });

    it("proves synthetic / fixture / preview variants never expose costCents or cost_cents", async () => {
      const devReader = new DevCatalogPreviewReader();
      const fixtureReader = new FixtureCatalogDiscoveryReader();

      const devProduct = await devReader.getPublishedProductBySlug("mouse-pro-mod-01");
      const fixtureProduct = await fixtureReader.getPublishedProductBySlug("mouse-pro-mod-01");

      expect(devProduct).not.toBeNull();
      for (const variant of devProduct!.variants) {
        expect(variant).not.toHaveProperty("costCents");
        expect(variant).not.toHaveProperty("cost_cents");
        expect((variant as unknown as Record<string, unknown>).costCents).toBeUndefined();
      }

      expect(fixtureProduct).not.toBeNull();
      for (const variant of fixtureProduct!.variants) {
        expect(variant).not.toHaveProperty("costCents");
        expect(variant).not.toHaveProperty("cost_cents");
        expect((variant as unknown as Record<string, unknown>).costCents).toBeUndefined();
      }
    });
  });

  describe("Remediation B — Canonical 13 Story Blocks Runtime Validation", () => {
    it("A: exactly 13 canonical semantic Story block types exist in registry", () => {
      expect(CANONICAL_STORY_BLOCK_TYPES).toHaveLength(13);
      expect(CANONICAL_STORY_BLOCK_TYPES).toEqual([
        "hero_media",
        "full_bleed_image",
        "image_text",
        "stat_highlight",
        "spec_feature",
        "video",
        "gallery",
        "comparison",
        "dimensions",
        "box_contents",
        "technical_specs",
        "faq",
        "related_products",
      ]);
    });

    it("B: validates all 13 canonical Story block types with valid payloads", () => {
      const all13Blocks = [
        {
          block_id: "blk-01",
          type: "hero_media",
          order: 1,
          payload: { headline: "Hero Headline", tagline: "Hero Tagline" },
        },
        {
          block_id: "blk-02",
          type: "full_bleed_image",
          order: 2,
          payload: { mediaKey: "media/fullbleed.png", altText: "Macro shot" },
        },
        {
          block_id: "blk-03",
          type: "image_text",
          order: 3,
          payload: { headline: "Chassis", body: "Magnesium body", mediaKey: "media/chassis.png" },
        },
        {
          block_id: "blk-04",
          type: "stat_highlight",
          order: 4,
          payload: { stats: [{ value: "39", label: "Peso", unit: "g" }] },
        },
        {
          block_id: "blk-05",
          type: "spec_feature",
          order: 5,
          payload: { title: "8K Polling", description: "Ultra-fast response", badge: "Flagship" },
        },
        {
          block_id: "blk-06",
          type: "video",
          order: 6,
          payload: { videoKey: "videos/sound-test.mp4", posterKey: "videos/poster.png" },
        },
        {
          block_id: "blk-07",
          type: "gallery",
          order: 7,
          payload: {
            items: [
              { mediaKey: "gallery/1.png", altText: "Angle 1" },
              { mediaKey: "gallery/2.png", altText: "Angle 2" },
            ],
          },
        },
        {
          block_id: "blk-08",
          type: "comparison",
          order: 8,
          payload: {
            headers: ["Feature", "Beast X", "Beast X Max"],
            rows: [["Weight", "39g", "42g"]],
          },
        },
        {
          block_id: "blk-09",
          type: "dimensions",
          order: 9,
          payload: { lengthMm: 122, widthMm: 62, heightMm: 37, gripTypes: ["Claw", "Fingertip"] },
        },
        {
          block_id: "blk-10",
          type: "box_contents",
          order: 10,
          payload: { items: [{ title: "WLMouse Beast X Max", count: 1 }] },
        },
        {
          block_id: "blk-11",
          type: "technical_specs",
          order: 11,
          payload: {
            groups: [
              {
                groupName: "General",
                specs: [{ label: "Sensor", value: "PAW3950" }],
              },
            ],
          },
        },
        {
          block_id: "blk-12",
          type: "faq",
          order: 12,
          payload: {
            items: [{ question: "How to update firmware?", answer: "Use the web driver." }],
          },
        },
        {
          block_id: "blk-13",
          type: "related_products",
          order: 13,
          payload: { categorySlugs: ["mousepads", "accesorios"] },
        },
      ];

      const validated = validateStoryBlocks(all13Blocks);
      expect(validated).not.toBeNull();
      expect(validated).toHaveLength(13);
      for (let i = 0; i < 13; i++) {
        expect(validated![i]!.type).toBe(CANONICAL_STORY_BLOCK_TYPES[i]);
      }
    });

    it("C: rejects unknown 14th block type safely", () => {
      const warnSpy = vi.spyOn(logger, "warn");
      const blocks = [
        {
          block_id: "blk-bad",
          type: "unknown_arbitrary_component",
          order: 1,
          payload: { data: "test" },
        },
      ];
      const validated = validateStoryBlocks(blocks);
      expect(validated).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_story_block_validation_failed",
          reason: "unrecognized_block_type",
        })
      );
    });

    it("D: rejects un-canonical features_grid block", () => {
      const blocks = [
        {
          block_id: "blk-grid",
          type: "features_grid",
          order: 1,
          payload: { items: [{ title: "Test", description: "Desc" }] },
        },
      ];
      const validated = validateStoryBlocks(blocks);
      expect(validated).toBeNull();
    });

    it("E: normalizes persisted hero alias to canonical hero_media", () => {
      const blocks = [
        {
          block_id: "blk-hero",
          type: "hero",
          order: 1,
          payload: { headline: "Hero Headline" },
        },
      ];
      const validated = validateStoryBlocks(blocks);
      expect(validated).not.toBeNull();
      expect(validated).toHaveLength(1);
      expect(validated![0]!.type).toBe("hero_media");
    });

    it("F: direct canonical hero_media representation succeeds", () => {
      const blocks = [
        {
          block_id: "blk-heromedia",
          type: "hero_media",
          order: 1,
          payload: { headline: "Direct Hero Media" },
        },
      ];
      const validated = validateStoryBlocks(blocks);
      expect(validated).not.toBeNull();
      expect(validated![0]!.type).toBe("hero_media");
    });

    it("G: rejects semantically empty payload structures (e.g. empty dimensions or related_products)", () => {
      const emptyDimensions = [
        {
          block_id: "blk-dim",
          type: "dimensions",
          order: 1,
          payload: {}, // No dimensions, no blueprint, no gripTypes
        },
      ];
      expect(validateStoryBlocks(emptyDimensions)).toBeNull();

      const emptyRelated = [
        {
          block_id: "blk-rel",
          type: "related_products",
          order: 1,
          payload: {}, // No categorySlugs, no productSlugs
        },
      ];
      expect(validateStoryBlocks(emptyRelated)).toBeNull();
    });

    it("H: handles non-array Story blocks safely without throwing", async () => {
      setupPostgresMocks({
        story: {
          ...defaultMockStory,
          blocks: "not an array",
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result).not.toBeNull();
      expect(result?.story).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_story_blocks_non_array_dropped",
          productId: mockProductId,
        })
      );
    });

    it("I: drops individual blocks with invalid envelope structure and preserves valid blocks", async () => {
      setupPostgresMocks({
        story: {
          ...defaultMockStory,
          blocks: [
            { type: "hero_media", order: 1, payload: { headline: "No ID" } }, // missing block_id
            {
              block_id: "blk-valid",
              type: "hero_media",
              order: 2,
              payload: { headline: "Valid Block" },
            },
          ],
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result?.story).not.toBeNull();
      expect(result?.story?.blocks).toHaveLength(1);
      expect(result?.story?.blocks[0]?.blockId).toBe("blk-valid");
      expect(result?.story?.blocks[0]?.type).toBe("hero_media");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_story_block_validation_failed",
          reason: "invalid_envelope_structure",
        })
      );
    });

    it("J: drops blocks with payload validation failures and omits story if zero valid blocks remain", async () => {
      setupPostgresMocks({
        story: {
          ...defaultMockStory,
          blocks: [
            {
              block_id: "blk-bad-payload",
              type: "hero_media",
              order: 1,
              payload: { headline: 12345 }, // invalid data type!
            },
          ],
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result?.story).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_story_block_validation_failed",
          reason: "payload_validation_failed",
        })
      );
    });

    it("K: rejects raw HTML / script tag injection in story block payload", async () => {
      setupPostgresMocks({
        story: {
          ...defaultMockStory,
          blocks: [
            {
              block_id: "blk-xss",
              type: "hero_media",
              order: 1,
              payload: { headline: "Normal title <script>alert(1)</script>" },
            },
          ],
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result?.story).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_story_block_validation_failed",
          reason: "payload_validation_failed",
        })
      );
    });

    it("L: synthetic Product Detail uses only canonical Story block types", async () => {
      const devReader = new DevCatalogPreviewReader();
      const product = await devReader.getPublishedProductBySlug("mouse-pro-mod-01");
      expect(product?.story).not.toBeNull();
      for (const block of product!.story!.blocks) {
        expect(CANONICAL_STORY_BLOCK_TYPES).toContain(block.type);
      }
    });
  });

  describe("Remediation C — Product Specification Defensive Consistency", () => {
    it("omits specifications when schema belongs to a different Category (cross-category inconsistency)", async () => {
      const foreignCategoryId = "018f0000-0000-7000-8000-foreigncat01";
      setupPostgresMocks({
        spec: {
          ...defaultMockSpec,
          schemaCategoryId: foreignCategoryId, // belongs to different category!
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("WLMouse Beast X Max");
      expect(result?.specifications).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_cross_category_specification_schema_dropped",
          productId: mockProductId,
          productCategoryId: mockCategoryId,
          schemaCategoryId: foreignCategoryId,
        })
      );
    });

    it("omits specifications when product and category schema versions mismatch", async () => {
      setupPostgresMocks({
        spec: {
          ...defaultMockSpec,
          productSchemaVersion: 1,
          categorySchemaVersion: 2, // version mismatch!
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result).not.toBeNull();
      expect(result?.specifications).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_specification_schema_version_mismatch_dropped",
          productId: mockProductId,
          productSchemaVersion: 1,
          categorySchemaVersion: 2,
        })
      );
    });

    it("omits specifications when category schema field definitions fail GP-013 validation", async () => {
      setupPostgresMocks({
        spec: {
          ...defaultMockSpec,
          schemaFieldDefinitions: [
            {
              key: "bad_field",
              label: "Bad Field",
              dataType: "number",
              filterable: true,
              filterKind: "NUMBER_RANGE",
              publicParam: "bad_field",
              min: 100,
              max: 50, // min > max violates validation!
            },
          ],
        },
      });
      const warnSpy = vi.spyOn(logger, "warn");
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result).not.toBeNull();
      expect(result?.specifications).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdp_invalid_specification_field_definitions_dropped",
          productId: mockProductId,
        })
      );
    });

    it("projects specifications accurately when schema category and version match and validate", async () => {
      setupPostgresMocks();
      const reader = new PostgresProductDetailReader();
      const result = await reader.getPublishedProductBySlug("wlmouse-beast-x-max");

      expect(result?.specifications).not.toBeNull();
      expect(result?.specifications?.schemaId).toBe(mockSchemaId);
      expect(result?.specifications?.schemaVersion).toBe(1);
      expect(result?.specifications?.specValues.weight_g).toBe(42);
      expect(result?.specifications?.schema.fieldDefinitions).toHaveLength(2);
    });
  });
});
