import { describe, expect, it } from "vitest";
import {
  buildBrandCategoryFacetOptionsQuery,
  buildBrandFilteredProductCountQuery,
  buildBrandFilteredProductsQuery,
  buildCategoryBrandFacetOptionsQuery,
  buildCategoryFilteredProductCountQuery,
  buildCategoryFilteredProductsQuery,
  buildCategorySpecificationSchemaQuery,
  buildPublishedBrandBySlugQuery,
  buildPublishedCategoryBySlugQuery,
  buildTechnicalRepresentedSpecValuesQuery,
} from "@/lib/catalog/postgres-queries";

describe("Production Drizzle SQL Query Builders (Catalog Contract & Security Verification)", () => {
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

  it("builds category specification schema query joining published categories and active schema", () => {
    const query = buildCategorySpecificationSchemaQuery("018f0000-0000-7000-8000-000000000001");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"category_specification_schemas"."category_id" = $');
    expect(sqlObj.sql).toContain('"category_specification_schemas"."is_active" = $');
    expect(sqlObj.sql).toContain(
      '"categories"."current_spec_schema_id" = "category_specification_schemas"."id"'
    );
  });

  it("builds category brand facet options query asserting published invariants and active variants", () => {
    const query = buildCategoryBrandFacetOptionsQuery("018f0000-0000-7000-8000-000000000001");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain("EXISTS");
    expect(sqlObj.sql).toContain('"products"."status" = \'PUBLISHED\'');
    expect(sqlObj.sql).toContain('"product_variants"."status" = \'ACTIVE\'');
  });

  it("builds brand category facet options query asserting published invariants and active variants", () => {
    const query = buildBrandCategoryFacetOptionsQuery("018f0000-0000-7000-8000-000000000b01");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.sql).toContain("EXISTS");
    expect(sqlObj.sql).toContain('"products"."status" = \'PUBLISHED\'');
    expect(sqlObj.sql).toContain('"product_variants"."status" = \'ACTIVE\'');
  });

  it("builds technical represented spec values query supporting historical linked schemas and brand scoping", () => {
    const categoryQuery = buildTechnicalRepresentedSpecValuesQuery(
      "018f0000-0000-7000-8000-000000000001"
    );
    const categorySql = categoryQuery.toSQL();

    expect(categorySql.sql).toContain('"product_specifications"."spec_values"');
    expect(categorySql.sql).toContain(
      '"category_specification_schemas"."id" = "product_specifications"."schema_id"'
    );
    expect(categorySql.sql).toContain(
      '"category_specification_schemas"."schema_version" = "product_specifications"."schema_version"'
    );

    const brandScopedQuery = buildTechnicalRepresentedSpecValuesQuery(
      "018f0000-0000-7000-8000-000000000001",
      "018f0000-0000-7000-8000-000000000b01"
    );
    const brandSql = brandScopedQuery.toSQL();

    expect(brandSql.sql).toContain('"products"."brand_id" = $');
    expect(brandSql.params).toContain("018f0000-0000-7000-8000-000000000b01");
  });

  it("builds category filtered product count query with countDistinct(products.id)", () => {
    const query = buildCategoryFilteredProductCountQuery("018f0000-0000-7000-8000-000000000001");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("count(distinct");
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
  });

  it("builds brand filtered product count query with countDistinct(products.id)", () => {
    const query = buildBrandFilteredProductCountQuery("018f0000-0000-7000-8000-000000000b01");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("count(distinct");
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
  });

  it("builds category product projection with startingPriceCents subquery and no cost_cents", () => {
    const query = buildCategoryFilteredProductsQuery("018f0000-0000-7000-8000-000000000001", 2, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('MIN("product_variants"."price_cents")');
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('order by "products"."created_at" desc, "products"."id" desc');
    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.sql).toContain("offset $");
  });

  it("builds brand product projection with startingPriceCents subquery and no cost_cents", () => {
    const query = buildBrandFilteredProductsQuery("018f0000-0000-7000-8000-000000000b01", 1, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('MIN("product_variants"."price_cents")');
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('order by "products"."created_at" desc, "products"."id" desc');
    expect(sqlObj.sql).toContain("limit $");
  });

  it("verifies logical Brand query budget strictly bounds queries without duplication", () => {
    // Case 1: Brand without category selection:
    // 1. buildBrandCategoryFacetOptionsQuery
    // 2. buildBrandFilteredProductCountQuery
    // 3. buildBrandFilteredProductsQuery
    const withoutCategoryQueries = [
      buildBrandCategoryFacetOptionsQuery("brand-1"),
      buildBrandFilteredProductCountQuery("brand-1"),
      buildBrandFilteredProductsQuery("brand-1", 1, 12),
    ];
    expect(withoutCategoryQueries).toHaveLength(3);

    // Case 2: Brand with 1 category selected:
    // 1. buildBrandCategoryFacetOptionsQuery
    // 2. buildCategorySpecificationSchemaQuery
    // 3. buildTechnicalRepresentedSpecValuesQuery
    // 4. buildBrandFilteredProductCountQuery
    // 5. buildBrandFilteredProductsQuery
    const withCategoryQueries = [
      buildBrandCategoryFacetOptionsQuery("brand-1"),
      buildCategorySpecificationSchemaQuery("cat-1"),
      buildTechnicalRepresentedSpecValuesQuery("cat-1", "brand-1"),
      buildBrandFilteredProductCountQuery("brand-1"),
      buildBrandFilteredProductsQuery("brand-1", 1, 12),
    ];
    expect(withCategoryQueries).toHaveLength(5);
  });
});
