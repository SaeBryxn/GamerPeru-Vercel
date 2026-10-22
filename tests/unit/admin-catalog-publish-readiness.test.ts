import { describe, expect, it } from "vitest";
import { evaluatePublishReadiness } from "@/lib/admin/catalog/publish-readiness";
import type {
  Brand,
  Category,
  CategorySpecificationSchema,
  MediaAsset,
  Product,
  ProductMedia,
  ProductSpecification,
  ProductVariant,
} from "@/db/schema";

describe("Admin Catalog Publish Readiness Pure Evaluator", () => {
  const baseProduct: Product = {
    id: "018f0000-0000-7000-8000-000000000001",
    brandId: "018f0000-0000-7000-8000-000000000002",
    categoryId: "018f0000-0000-7000-8000-000000000003",
    name: "WLmouse Beast X Mini",
    slug: "wlmouse-beast-x-mini",
    subtitle: "Mouse gamer ultraligero de magnesio",
    description:
      "Este es un mouse gamer de alto rendimiento con chasis de aleación de magnesio y tasa de sondeo 8K.",
    status: "DRAFT",
    isFeatured: false,
    pdpConfig: {},
    primaryMediaId: "018f0000-0000-7000-8000-000000000010",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseBrand: Brand = {
    id: baseProduct.brandId,
    name: "WLmouse",
    slug: "wlmouse",
    description: "Marca innovadora de periféricos",
    websiteUrl: "https://wlmouse.com",
    logoMediaId: null,
    status: "PUBLISHED",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseCategory: Category = {
    id: baseProduct.categoryId,
    name: "Mice",
    slug: "mice",
    parentId: null,
    currentSpecSchemaId: "018f0000-0000-7000-8000-000000000004",
    description: "Ratones de competición",
    displayOrder: 1,
    status: "PUBLISHED",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseSchema: CategorySpecificationSchema = {
    id: baseCategory.currentSpecSchemaId!,
    categoryId: baseCategory.id,
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "sensor",
        label: "Sensor",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "sensor",
        displayOrder: 1,
        options: [{ value: "paw3395", label: "PAW3395" }],
      },
    ],
    isActive: true,
    createdAt: new Date(),
  };

  const baseSpecs: ProductSpecification = {
    productId: baseProduct.id,
    schemaId: baseSchema.id,
    schemaVersion: 1,
    specValues: { sensor: "paw3395" },
    updatedAt: new Date(),
  };

  const baseVariant: ProductVariant = {
    id: "018f0000-0000-7000-8000-000000000005",
    productId: baseProduct.id,
    sku: "WLM-BXM-BLK",
    title: "Negro Metálico",
    priceCents: 54900,
    compareAtPriceCents: 59900,
    costCents: 35000,
    weightGrams: 34,
    attributes: { color: "Negro" },
    status: "ACTIVE",
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseMediaAsset: MediaAsset = {
    id: baseProduct.primaryMediaId!,
    objectKey: "catalog/beast-x-mini-black.webp",
    securityClass: "PUBLIC_MEDIA",
    mediaType: "IMAGE",
    mimeType: "image/webp",
    fileSizeBytes: 45000,
    width: 1200,
    height: 1200,
    altText: "WLmouse Beast X Mini Vista Frontal",
    checksumSha256: null,
    createdAt: new Date(),
  };

  const baseMediaAttachment: ProductMedia & { mediaAsset: MediaAsset } = {
    id: "018f0000-0000-7000-8000-000000000020",
    productId: baseProduct.id,
    mediaAssetId: baseMediaAsset.id,
    variantId: null, // Global
    displayOrder: 0,
    placement: "GALLERY",
    createdAt: new Date(),
    mediaAsset: baseMediaAsset,
  };

  it("approves publish readiness when all hard requirements are met", () => {
    const result = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [baseMediaAttachment],
      primaryMediaAsset: baseMediaAsset,
    });

    expect(result.isPublishable).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails closed if name or slug is invalid", () => {
    const invalidNameRes = evaluatePublishReadiness({
      product: { ...baseProduct, name: "" },
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(invalidNameRes.isPublishable).toBe(false);
    expect(invalidNameRes.blockers.some((b) => b.code === "PRODUCT_NAME_REQUIRED")).toBe(true);

    const invalidSlugRes = evaluatePublishReadiness({
      product: { ...baseProduct, slug: "Invalid Slug With Spaces!" },
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(invalidSlugRes.isPublishable).toBe(false);
    expect(invalidSlugRes.blockers.some((b) => b.code === "PRODUCT_SLUG_INVALID_FORMAT")).toBe(
      true
    );
  });

  it("fails closed if brand or category is not PUBLISHED", () => {
    const draftBrandRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: { ...baseBrand, status: "DRAFT" },
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(draftBrandRes.isPublishable).toBe(false);
    expect(draftBrandRes.blockers.some((b) => b.code === "BRAND_NOT_PUBLISHED")).toBe(true);

    const draftCatRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: { ...baseCategory, status: "DRAFT" },
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(draftCatRes.isPublishable).toBe(false);
    expect(draftCatRes.blockers.some((b) => b.code === "CATEGORY_NOT_PUBLISHED")).toBe(true);
  });

  it("fails closed if no ACTIVE variants exist or active variant has zero price", () => {
    const noActiveRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [{ ...baseVariant, status: "INACTIVE" }],
      media: [baseMediaAttachment],
    });
    expect(noActiveRes.isPublishable).toBe(false);
    expect(noActiveRes.blockers.some((b) => b.code === "NO_ACTIVE_VARIANTS")).toBe(true);

    const zeroPriceRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [{ ...baseVariant, priceCents: 0 }],
      media: [baseMediaAttachment],
    });
    expect(zeroPriceRes.isPublishable).toBe(false);
    expect(zeroPriceRes.blockers.some((b) => b.code === "VARIANT_PRICE_INVALID")).toBe(true);
  });

  it("fails closed if category schema is active but product specifications are missing or invalid", () => {
    const missingSpecsRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: null,
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(missingSpecsRes.isPublishable).toBe(false);
    expect(missingSpecsRes.blockers.some((b) => b.code === "PRODUCT_SPECIFICATIONS_MISSING")).toBe(
      true
    );

    const invalidSpecValRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: {
        ...baseSpecs,
        specValues: { sensor: "invalid_sensor" },
      },
      variants: [baseVariant],
      media: [baseMediaAttachment],
    });
    expect(invalidSpecValRes.isPublishable).toBe(false);
    expect(invalidSpecValRes.blockers.some((b) => b.code === "INVALID_ENUM_OPTION")).toBe(true);
  });

  it("fails closed if no valid public global media is attached or primary media is attached to a variant", () => {
    const noMediaRes = evaluatePublishReadiness({
      product: { ...baseProduct, primaryMediaId: null },
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [],
    });
    expect(noMediaRes.isPublishable).toBe(false);
    expect(noMediaRes.blockers.some((b) => b.code === "NO_VALID_PUBLIC_MEDIA")).toBe(true);

    // Primary media assigned to variant instead of global
    const variantPrimaryRes = evaluatePublishReadiness({
      product: baseProduct,
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [baseVariant],
      media: [{ ...baseMediaAttachment, variantId: baseVariant.id }],
    });
    expect(variantPrimaryRes.isPublishable).toBe(false);
    expect(variantPrimaryRes.blockers.some((b) => b.code === "PRIMARY_MEDIA_MUST_BE_GLOBAL")).toBe(
      true
    );
  });

  it("generates soft warnings for non-blocking omissions", () => {
    const resultWithWarnings = evaluatePublishReadiness({
      product: {
        ...baseProduct,
        subtitle: null,
        description: "Breve.",
      },
      brand: baseBrand,
      category: baseCategory,
      currentSpecSchema: baseSchema,
      specifications: baseSpecs,
      variants: [
        {
          ...baseVariant,
          compareAtPriceCents: null,
          weightGrams: null,
        },
      ],
      media: [baseMediaAttachment],
      primaryMediaAsset: baseMediaAsset,
    });

    expect(resultWithWarnings.isPublishable).toBe(true);
    expect(resultWithWarnings.blockers).toHaveLength(0);
    expect(resultWithWarnings.warnings.some((w) => w.code === "MISSING_SUBTITLE")).toBe(true);
    expect(resultWithWarnings.warnings.some((w) => w.code === "SHORT_DESCRIPTION")).toBe(true);
    expect(resultWithWarnings.warnings.some((w) => w.code === "NO_COMPARE_AT_PRICE")).toBe(true);
    expect(resultWithWarnings.warnings.some((w) => w.code === "MISSING_WEIGHT")).toBe(true);
  });

  describe("Section 17 Media Readiness Invariants", () => {
    it("A. global PUBLIC_MEDIA IMAGE image/webp is valid", () => {
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(true);
      expect(res.blockers.some((b) => b.code === "NO_VALID_PUBLIC_MEDIA")).toBe(false);
    });

    it("B. global PUBLIC_MEDIA IMAGE with disallowed MIME does NOT satisfy media readiness", () => {
      const disallowedAsset: MediaAsset = {
        ...baseMediaAsset,
        id: "018f0000-0000-7000-8000-000000000099",
        mimeType: "video/mp4",
      };
      const res = evaluatePublishReadiness({
        product: { ...baseProduct, primaryMediaId: null },
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [
          { ...baseMediaAttachment, mediaAssetId: disallowedAsset.id, mediaAsset: disallowedAsset },
        ],
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "NO_VALID_PUBLIC_MEDIA")).toBe(true);
    });

    it("C. disallowed image set as primary is still blocked (cannot bypass via non-null primaryMediaId)", () => {
      const disallowedAsset: MediaAsset = {
        ...baseMediaAsset,
        id: "018f0000-0000-7000-8000-000000000099",
        mimeType: "application/pdf",
      };
      const res = evaluatePublishReadiness({
        product: { ...baseProduct, primaryMediaId: disallowedAsset.id },
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [
          { ...baseMediaAttachment, mediaAssetId: disallowedAsset.id, mediaAsset: disallowedAsset },
        ],
        primaryMediaAsset: disallowedAsset,
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "NO_VALID_PUBLIC_MEDIA")).toBe(true);
      expect(res.blockers.some((b) => b.code === "PRIMARY_MEDIA_INVALID_ASSET")).toBe(true);
    });

    it("D. allowed global image + valid primary is fully publishable", () => {
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("E. cross-product Variant media is strictly blocked", () => {
      const foreignVariantId = "018f0000-0000-7000-8000-000000000999";
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [
          baseMediaAttachment,
          {
            ...baseMediaAttachment,
            id: "018f0000-0000-7000-8000-000000000021",
            variantId: foreignVariantId,
          },
        ],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "MEDIA_VARIANT_PRODUCT_MISMATCH")).toBe(true);
    });

    it("F. variant-specific-only image does not satisfy global publish-media requirement", () => {
      const res = evaluatePublishReadiness({
        product: { ...baseProduct, primaryMediaId: null },
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [baseVariant],
        media: [
          {
            ...baseMediaAttachment,
            variantId: baseVariant.id, // Only variant-attached, zero global
          },
        ],
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "NO_VALID_PUBLIC_MEDIA")).toBe(true);
    });
  });

  describe("Variant Persisted Attributes Validation (Defect B / BR3)", () => {
    it("accepts attributes = { color: 'black' }", () => {
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: { color: "black" } }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(true);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(false);
    });

    it("accepts attributes = {}", () => {
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: {} }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(true);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(false);
    });

    it("rejects attributes = { color: 123 } with VARIANT_ATTRIBUTES_INVALID and isPublishable == false", () => {
      const malformed = { color: 123 } as unknown as Record<string, string>;
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: malformed }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(false);
      const blocker = res.blockers.find((b) => b.code === "VARIANT_ATTRIBUTES_INVALID");
      expect(blocker).toBeDefined();
      expect(blocker?.message).toBe(
        `La variante "${baseVariant.title}" tiene atributos con formato inválido.`
      );
    });

    it("rejects attributes = { wireless: true } with VARIANT_ATTRIBUTES_INVALID", () => {
      const malformed = { wireless: true } as unknown as Record<string, string>;
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: malformed }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(true);
    });

    it("rejects attributes = { nested: { value: 'x' } } with VARIANT_ATTRIBUTES_INVALID", () => {
      const malformed = { nested: { value: "x" } } as unknown as Record<string, string>;
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: malformed }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(true);
    });

    it("rejects attributes = [] with VARIANT_ATTRIBUTES_INVALID", () => {
      const malformed = [] as unknown as Record<string, string>;
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: malformed }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(false);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(true);
    });

    it("accepts legitimate long string key/value without arbitrary length rejections", () => {
      const longKey = "custom_attribute_key_".repeat(6);
      const longVal = "very_detailed_attribute_value_string_".repeat(12);
      const validAttrs = { [longKey]: longVal, color: "Midnight Blue", edition: "Special Edition" };
      const res = evaluatePublishReadiness({
        product: baseProduct,
        brand: baseBrand,
        category: baseCategory,
        currentSpecSchema: baseSchema,
        specifications: baseSpecs,
        variants: [{ ...baseVariant, attributes: validAttrs }],
        media: [baseMediaAttachment],
        primaryMediaAsset: baseMediaAsset,
      });
      expect(res.isPublishable).toBe(true);
      expect(res.blockers.some((b) => b.code === "VARIANT_ATTRIBUTES_INVALID")).toBe(false);
    });
  });
});
