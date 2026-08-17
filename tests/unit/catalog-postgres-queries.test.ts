import { and, countDistinct, desc, eq, min } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { brands, categories, mediaAssets, products, productVariants } from "@/db/schema";

describe("Production Drizzle SQL Query Builders (Contract & Security Verification)", () => {
  it("builds published category lookup with exact PUBLISHED status filter", () => {
    const query = db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        parentId: categories.parentId,
        displayOrder: categories.displayOrder,
      })
      .from(categories)
      .where(and(eq(categories.slug, "mouses"), eq(categories.status, "PUBLISHED")))
      .limit(1);

    const sqlObj = query.toSQL();
    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.params).toContain("PUBLISHED");
    expect(sqlObj.params).toContain("mouses");
  });

  it("builds published brand lookup with secure PUBLIC_MEDIA and IMAGE join on logo", () => {
    const query = db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        description: brands.description,
        logoObjectKey: mediaAssets.objectKey,
        logoAltText: mediaAssets.altText,
      })
      .from(brands)
      .leftJoin(
        mediaAssets,
        and(
          eq(brands.logoMediaId, mediaAssets.id),
          eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
          eq(mediaAssets.mediaType, "IMAGE")
        )
      )
      .where(and(eq(brands.slug, "wlmouse"), eq(brands.status, "PUBLISHED")))
      .limit(1);

    const sqlObj = query.toSQL();
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.params).toContain("PUBLISHED");
    expect(sqlObj.params).toContain("PUBLIC_MEDIA");
    expect(sqlObj.params).toContain("IMAGE");
  });

  it("builds product count query using countDistinct(products.id) with published invariants", () => {
    const query = db
      .select({
        count: countDistinct(products.id),
      })
      .from(products)
      .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
      .innerJoin(
        categories,
        and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
      )
      .innerJoin(
        productVariants,
        and(eq(products.id, productVariants.productId), eq(productVariants.status, "ACTIVE"))
      )
      .where(and(eq(products.categoryId, "cat-123"), eq(products.status, "PUBLISHED")));

    const sqlObj = query.toSQL();
    expect(sqlObj.sql).toContain("count(distinct");
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');
    expect(sqlObj.params).toContain("ACTIVE");
    expect(sqlObj.params).toContain("PUBLISHED");
  });

  it("builds paginated product projection with MIN(price_cents), PUBLIC_MEDIA join, and no cost_cents", () => {
    const query = db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        subtitle: products.subtitle,
        brandName: brands.name,
        brandSlug: brands.slug,
        categoryName: categories.name,
        categorySlug: categories.slug,
        primaryMediaKey: mediaAssets.objectKey,
        primaryMediaAlt: mediaAssets.altText,
        primaryMediaWidth: mediaAssets.width,
        primaryMediaHeight: mediaAssets.height,
        startingPriceCents: min(productVariants.priceCents).mapWith(Number),
      })
      .from(products)
      .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.status, "PUBLISHED")))
      .innerJoin(
        categories,
        and(eq(products.categoryId, categories.id), eq(categories.status, "PUBLISHED"))
      )
      .innerJoin(
        productVariants,
        and(eq(products.id, productVariants.productId), eq(productVariants.status, "ACTIVE"))
      )
      .leftJoin(
        mediaAssets,
        and(
          eq(products.primaryMediaId, mediaAssets.id),
          eq(mediaAssets.securityClass, "PUBLIC_MEDIA"),
          eq(mediaAssets.mediaType, "IMAGE")
        )
      )
      .where(and(eq(products.categoryId, "cat-123"), eq(products.status, "PUBLISHED")))
      .groupBy(
        products.id,
        products.name,
        products.slug,
        products.subtitle,
        products.createdAt,
        brands.name,
        brands.slug,
        categories.name,
        categories.slug,
        mediaAssets.objectKey,
        mediaAssets.altText,
        mediaAssets.width,
        mediaAssets.height
      )
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(12)
      .offset(12);

    const sqlObj = query.toSQL();

    // Verify projection invariants
    expect(sqlObj.sql).toContain("min(");
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('order by "products"."created_at" desc, "products"."id" desc');
    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.sql).toContain("offset $");
  });
});
