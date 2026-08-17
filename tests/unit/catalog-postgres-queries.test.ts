import { describe, expect, it } from "vitest";
import {
  buildBrandProductCountQuery,
  buildBrandProductsQuery,
  buildCategoryProductCountQuery,
  buildCategoryProductsQuery,
  buildPublishedBrandBySlugQuery,
  buildPublishedCategoryBySlugQuery,
} from "@/lib/catalog/postgres-queries";

describe("Production Drizzle SQL Query Builders (Contract & Security Verification)", () => {
  it("builds published category lookup with exact PUBLISHED status filter", () => {
    const query = buildPublishedCategoryBySlugQuery("mouses");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.params).toContain("PUBLISHED");
    expect(sqlObj.params).toContain("mouses");
  });

  it("builds published brand lookup with secure PUBLIC_MEDIA and IMAGE join on logo", () => {
    const query = buildPublishedBrandBySlugQuery("marca-qa");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.params).toContain("PUBLISHED");
    expect(sqlObj.params).toContain("PUBLIC_MEDIA");
    expect(sqlObj.params).toContain("IMAGE");
  });

  it("builds category product count query using countDistinct(products.id) with published invariants", () => {
    const query = buildCategoryProductCountQuery("cat-123");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("count(distinct");
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');
    expect(sqlObj.params).toContain("ACTIVE");
    expect(sqlObj.params).toContain("PUBLISHED");
  });

  it("builds brand product count query using countDistinct(products.id) with published invariants", () => {
    const query = buildBrandProductCountQuery("brand-123");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("count(distinct");
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');
    expect(sqlObj.params).toContain("ACTIVE");
    expect(sqlObj.params).toContain("PUBLISHED");
  });

  it("builds category product projection with MIN(price_cents), PUBLIC_MEDIA join, and no cost_cents", () => {
    const query = buildCategoryProductsQuery("cat-123", 2, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("min(");
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('order by "products"."created_at" desc, "products"."id" desc');
    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.sql).toContain("offset $");
  });

  it("builds brand product projection with MIN(price_cents), PUBLIC_MEDIA join, and no cost_cents", () => {
    const query = buildBrandProductsQuery("brand-123", 1, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("min(");
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('order by "products"."created_at" desc, "products"."id" desc');
    expect(sqlObj.sql).toContain("limit $");
  });
});
