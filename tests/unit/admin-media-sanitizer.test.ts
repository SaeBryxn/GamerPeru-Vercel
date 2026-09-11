import { describe, it, expect } from "vitest";
import { sanitizeProductDetailForUi } from "@/lib/admin/catalog/ui-dto";
import type { AdminProductDetail } from "@/lib/admin/catalog/types";

describe("GP-024 / CHK2-BR1 — Media Security Boundary & Sanitizer Contract Tests", () => {
  const mockBaseProduct = {
    id: "018f0000-0000-7000-8000-000000000001",
    name: "Test Mouse",
    slug: "test-mouse",
    brandId: "018f0000-0000-7000-8000-000000000002",
    categoryId: "018f0000-0000-7000-8000-000000000003",
    subtitle: null,
    description: null,
    status: "DRAFT" as const,
    isFeatured: false,
    primaryMediaId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBaseDetail: AdminProductDetail = {
    product: mockBaseProduct,
    brand: {
      id: "018f0000-0000-7000-8000-000000000002",
      name: "Test Brand",
      slug: "test-brand",
      description: null,
      websiteUrl: null,
      logoMediaId: null,
      status: "PUBLISHED",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    category: {
      id: "018f0000-0000-7000-8000-000000000003",
      name: "Mouses",
      slug: "mouses",
      description: null,
      parentId: null,
      displayOrder: 1,
      status: "PUBLISHED",
      currentSpecSchemaId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    currentSpecSchema: null,
    specifications: null,
    variants: [],
    media: [],
    primaryMedia: null,
    publishReadiness: {
      isPublishable: false,
      blockers: [],
      warnings: [],
    },
  };

  it("strips raw objectKey and sets publicUrl to null for non-PUBLIC_MEDIA assets", () => {
    const sentinelKey = "private/credentials/sentinel_secret_do_not_expose_999.png";
    const detailWithPrivateMedia: AdminProductDetail = {
      ...mockBaseDetail,
      primaryMedia: {
        id: "media-asset-private-1",
        objectKey: sentinelKey,
        securityClass: "PRIVATE_BACKUP",
        mediaType: "IMAGE",
        mimeType: "image/png",
        width: 800,
        height: 600,
        altText: "Internal document",
        fileSizeBytes: 1024,
        checksumSha256: "abc",
        createdAt: new Date(),
      },
      media: [
        {
          id: "prod-media-1",
          productId: mockBaseProduct.id,
          mediaAssetId: "media-asset-private-1",
          variantId: null,
          displayOrder: 1,
          createdAt: new Date(),
          mediaAsset: {
            objectKey: sentinelKey,
            securityClass: "PRIVATE_BACKUP",
            mediaType: "IMAGE",
            mimeType: "image/png",
            width: 800,
            height: 600,
            altText: "Internal document",
          },
        },
      ],
    };

    const sanitized = sanitizeProductDetailForUi(detailWithPrivateMedia);

    // 1. Primary media assertions
    expect(sanitized.primaryMedia).not.toBeNull();
    expect(sanitized.primaryMedia?.publicUrl).toBeNull();
    expect(sanitized.primaryMedia?.securityClass).toBe("PRIVATE_BACKUP");
    expect("objectKey" in (sanitized.primaryMedia as unknown as Record<string, unknown>)).toBe(
      false
    );

    // 2. Media array assertions
    expect(sanitized.media.length).toBe(1);
    expect(sanitized.media[0]?.publicUrl).toBeNull();
    expect(sanitized.media[0]?.securityClass).toBe("PRIVATE_BACKUP");
    expect("objectKey" in (sanitized.media[0] as unknown as Record<string, unknown>)).toBe(false);

    // 3. Complete serialized payload check: sentinel must NOT appear anywhere in the UI DTO
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(sentinelKey);
    expect(serialized).not.toContain("sentinel_secret_do_not_expose_999");
  });

  it("resolves canonical publicUrl for PUBLIC_MEDIA assets while omitting raw objectKey", () => {
    const publicImageKey = "products/mouse-pro/hero.webp";
    const detailWithPublicMedia: AdminProductDetail = {
      ...mockBaseDetail,
      primaryMedia: {
        id: "media-asset-pub-1",
        objectKey: publicImageKey,
        securityClass: "PUBLIC_MEDIA",
        mediaType: "IMAGE",
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        altText: "Hero Image",
        fileSizeBytes: 2048,
        checksumSha256: "def",
        createdAt: new Date(),
      },
      media: [
        {
          id: "prod-media-pub-1",
          productId: mockBaseProduct.id,
          mediaAssetId: "media-asset-pub-1",
          variantId: null,
          displayOrder: 1,
          createdAt: new Date(),
          mediaAsset: {
            objectKey: publicImageKey,
            securityClass: "PUBLIC_MEDIA",
            mediaType: "IMAGE",
            mimeType: "image/webp",
            width: 1200,
            height: 800,
            altText: "Hero Image",
          },
        },
      ],
    };

    const sanitized = sanitizeProductDetailForUi(detailWithPublicMedia);

    expect(sanitized.primaryMedia?.publicUrl).toBe("/media/products/mouse-pro/hero.webp");
    expect(sanitized.media[0]?.publicUrl).toBe("/media/products/mouse-pro/hero.webp");
    expect("objectKey" in (sanitized.primaryMedia as unknown as Record<string, unknown>)).toBe(
      false
    );
    expect("objectKey" in (sanitized.media[0] as unknown as Record<string, unknown>)).toBe(false);
  });
});
