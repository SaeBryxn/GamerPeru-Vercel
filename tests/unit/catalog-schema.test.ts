import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Catalog Schema — Physical Bootstrap Integrity", () => {
  it("exports exactly the 10 approved canonical catalog tables", () => {
    expect(schema.mediaAssets).toBeDefined();
    expect(schema.brands).toBeDefined();
    expect(schema.categories).toBeDefined();
    expect(schema.products).toBeDefined();
    expect(schema.productVariants).toBeDefined();
    expect(schema.categorySpecificationSchemas).toBeDefined();
    expect(schema.productSpecifications).toBeDefined();
    expect(schema.productMedia).toBeDefined();
    expect(schema.productStoryRevisions).toBeDefined();
    expect(schema.productStories).toBeDefined();

    // Verify deferred tables are NOT present in this gate
    expect((schema as Record<string, unknown>).collections).toBeUndefined();
    expect((schema as Record<string, unknown>).productCollections).toBeUndefined();
    expect((schema as Record<string, unknown>).orders).toBeUndefined();
    expect((schema as Record<string, unknown>).payments).toBeUndefined();
    expect((schema as Record<string, unknown>).inventory).toBeUndefined();
  });

  it("exports the 4 canonical catalog PostgreSQL enums", () => {
    expect(schema.catalogStatusEnum.enumValues).toEqual(["DRAFT", "PUBLISHED", "ARCHIVED"]);
    expect(schema.variantStatusEnum.enumValues).toEqual(["ACTIVE", "INACTIVE", "ARCHIVED"]);
    expect(schema.securityClassEnum.enumValues).toEqual([
      "PUBLIC_MEDIA",
      "PRIVATE_PAYMENT_PROOF",
      "PRIVATE_BACKUP",
    ]);
    expect(schema.mediaTypeEnum.enumValues).toEqual(["IMAGE", "VIDEO", "DOCUMENT"]);
  });

  describe("media_assets table", () => {
    it("has canonical column definitions and types", () => {
      const cols = getTableColumns(schema.mediaAssets);
      expect(cols.id).toBeDefined();
      expect(cols.objectKey).toBeDefined();
      expect(cols.securityClass).toBeDefined();
      expect(cols.mediaType).toBeDefined();
      expect(cols.mimeType).toBeDefined();
      expect(cols.fileSizeBytes).toBeDefined();
      expect(cols.width).toBeDefined();
      expect(cols.height).toBeDefined();
      expect(cols.altText).toBeDefined();
      expect(cols.checksumSha256).toBeDefined();
      expect(cols.createdAt).toBeDefined();
    });
  });

  describe("brands table", () => {
    it("has canonical column definitions and types", () => {
      const cols = getTableColumns(schema.brands);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.slug).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.websiteUrl).toBeDefined();
      expect(cols.logoMediaId).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("categories table", () => {
    it("has canonical column definitions including current_spec_schema_id", () => {
      const cols = getTableColumns(schema.categories);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.slug).toBeDefined();
      expect(cols.parentId).toBeDefined();
      expect(cols.currentSpecSchemaId).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.displayOrder).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();

      // Ensure non-canonical hero_media_id is NOT in categories
      expect((cols as Record<string, unknown>).heroMediaId).toBeUndefined();
    });
  });

  describe("category_specification_schemas table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.categorySpecificationSchemas);
      expect(cols.id).toBeDefined();
      expect(cols.categoryId).toBeDefined();
      expect(cols.schemaVersion).toBeDefined();
      expect(cols.fieldDefinitions).toBeDefined();
      expect(cols.isActive).toBeDefined();
      expect(cols.createdAt).toBeDefined();
    });
  });

  describe("product_specifications table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.productSpecifications);
      expect(cols.productId).toBeDefined();
      expect(cols.schemaId).toBeDefined();
      expect(cols.schemaVersion).toBeDefined();
      expect(cols.specValues).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("products table", () => {
    it("has canonical column definitions including primary_media_id", () => {
      const cols = getTableColumns(schema.products);
      expect(cols.id).toBeDefined();
      expect(cols.brandId).toBeDefined();
      expect(cols.categoryId).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.slug).toBeDefined();
      expect(cols.subtitle).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.isFeatured).toBeDefined();
      expect(cols.primaryMediaId).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("product_variants table", () => {
    it("has canonical column definitions and excludes non-canonical media_id", () => {
      const cols = getTableColumns(schema.productVariants);
      expect(cols.id).toBeDefined();
      expect(cols.productId).toBeDefined();
      expect(cols.sku).toBeDefined();
      expect(cols.title).toBeDefined();
      expect(cols.priceCents).toBeDefined();
      expect(cols.compareAtPriceCents).toBeDefined();
      expect(cols.costCents).toBeDefined();
      expect(cols.weightGrams).toBeDefined();
      expect(cols.attributes).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.displayOrder).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();

      // Ensure non-canonical media_id is NOT in product_variants
      expect((cols as Record<string, unknown>).mediaId).toBeUndefined();
    });
  });

  describe("product_media table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.productMedia);
      expect(cols.id).toBeDefined();
      expect(cols.productId).toBeDefined();
      expect(cols.mediaAssetId).toBeDefined();
      expect(cols.variantId).toBeDefined();
      expect(cols.displayOrder).toBeDefined();
      expect(cols.createdAt).toBeDefined();
    });
  });

  describe("product_story_revisions table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.productStoryRevisions);
      expect(cols.id).toBeDefined();
      expect(cols.productId).toBeDefined();
      expect(cols.revisionNumber).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.blocks).toBeDefined();
      expect(cols.publishedAt).toBeDefined();
      expect(cols.createdByAuthUserId).toBeDefined();
      expect(cols.createdAt).toBeDefined();
    });
  });

  describe("product_stories table", () => {
    it("has canonical column definitions", () => {
      const cols = getTableColumns(schema.productStories);
      expect(cols.productId).toBeDefined();
      expect(cols.publishedRevisionId).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });
});
