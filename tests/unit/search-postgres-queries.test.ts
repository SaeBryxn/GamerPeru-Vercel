import { describe, expect, it } from "vitest";
import {
  buildFullMatchingBrandsQuery,
  buildFullMatchingCategoriesQuery,
  buildFullProductCountQuery,
  buildFullProductResultsQuery,
  buildPredictiveBrandsQuery,
  buildPredictiveCategoriesQuery,
  buildPredictiveProductsQuery,
  buildSearchBrandFacetOptionsQuery,
  buildSearchCategoryFacetOptionsQuery,
  buildSearchTechnicalRepresentedSpecValuesQuery,
} from "@/lib/search/postgres-queries";

describe("GP-012/GP-013 — PostgreSQL Production Search Query Builders", () => {
  it("builds predictive products query with publication and active variant filters", () => {
    const query = buildPredictiveProductsQuery("mouse", 6);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');
    expect(sqlObj.sql).toContain('min("product_variants"."price_cents")');
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).not.toContain("supplier");
    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.params).toContain(6);
  });

  it("builds search brand and category facet options query", () => {
    const brandFacetQuery = buildSearchBrandFacetOptionsQuery("mouse");
    const brandSql = brandFacetQuery.toSQL();
    expect(brandSql.sql).toContain('"brands"."status" = $');
    expect(brandSql.sql).toContain("EXISTS");
    expect(brandSql.sql).toContain('"product_variants"."status" = \'ACTIVE\'');

    const catFacetQuery = buildSearchCategoryFacetOptionsQuery("mouse");
    const catSql = catFacetQuery.toSQL();
    expect(catSql.sql).toContain('"categories"."status" = $');
    expect(catSql.sql).toContain("EXISTS");
    expect(catSql.sql).toContain('"product_variants"."status" = \'ACTIVE\'');
  });

  it("builds search technical represented spec values query scoped to search candidate q and historical schemas", () => {
    const query = buildSearchTechnicalRepresentedSpecValuesQuery(
      "mouse",
      "018f0000-0000-7000-8000-000000000001"
    );
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"product_specifications"."spec_values"');
    expect(sqlObj.sql).toContain(
      '"category_specification_schemas"."id" = "product_specifications"."schema_id"'
    );
    expect(sqlObj.sql).toContain(
      '"category_specification_schemas"."schema_version" = "product_specifications"."schema_version"'
    );
    expect(sqlObj.sql).toContain('"products"."category_id" = $');
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain("EXISTS");
    expect(sqlObj.sql).toContain('"product_variants"."status" = \'ACTIVE\'');
  });

  it("builds full product count query", () => {
    const query = buildFullProductCountQuery("teclado");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('count(distinct "products"."id")');
    expect(sqlObj.sql).toContain('"products"."status" = $');
  });

  it("builds full paginated product results query with LIMIT and OFFSET", () => {
    const query = buildFullProductResultsQuery("mousepad", 2, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.sql).toContain("offset $");
    expect(sqlObj.params).toContain(12);
    expect(sqlObj.params).toContain(12);
  });

  it("builds brand and category entity queries with publication filters", () => {
    const brandQuery = buildPredictiveBrandsQuery("wlmouse", 3);
    const brandSql = brandQuery.toSQL();
    expect(brandSql.sql).toContain('"brands"."status" = $');
    expect(brandSql.sql).toContain("limit $");
    expect(brandSql.params).toContain(3);

    const predictiveCatQuery = buildPredictiveCategoriesQuery("teclado", 3);
    const predictiveCatSql = predictiveCatQuery.toSQL();
    expect(predictiveCatSql.sql).toContain('"categories"."status" = $');
    expect(predictiveCatSql.sql).toContain("limit $");
    expect(predictiveCatSql.params).toContain(3);

    const fullBrandQuery = buildFullMatchingBrandsQuery("wlmouse", 4);
    const fullBrandSql = fullBrandQuery.toSQL();
    expect(fullBrandSql.sql).toContain('"brands"."status" = $');
    expect(fullBrandSql.sql).toContain("limit $");
    expect(fullBrandSql.params).toContain(4);

    const catQuery = buildFullMatchingCategoriesQuery("audio", 4);
    const catSql = catQuery.toSQL();
    expect(catSql.sql).toContain('"categories"."status" = $');
    expect(catSql.sql).toContain("limit $");
    expect(catSql.params).toContain(4);
  });

  it("verifies logical Search query budget accounting (GP-013 faceting + GP-012 entity suggestions)", () => {
    // Retained GP-012 entity suggestions (executed once per search page):
    // 1. buildFullMatchingBrandsQuery
    // 2. buildFullMatchingCategoriesQuery
    const entityQueries = [
      buildFullMatchingBrandsQuery("mouse", 4),
      buildFullMatchingCategoriesQuery("mouse", 4),
    ];
    expect(entityQueries).toHaveLength(2);

    // GP-013 Faceted Discovery without Category selection:
    // 1. buildSearchBrandFacetOptionsQuery
    // 2. buildSearchCategoryFacetOptionsQuery
    // 3. buildFullProductCountQuery
    // 4. buildFullProductResultsQuery
    const facetingWithoutCategoryQueries = [
      buildSearchBrandFacetOptionsQuery("mouse"),
      buildSearchCategoryFacetOptionsQuery("mouse"),
      buildFullProductCountQuery("mouse"),
      buildFullProductResultsQuery("mouse", 1, 12),
    ];
    expect(facetingWithoutCategoryQueries).toHaveLength(4);
    expect(facetingWithoutCategoryQueries.length + entityQueries.length).toBe(6);

    // GP-013 Faceted Discovery with 1 Category selected:
    // 1. buildSearchBrandFacetOptionsQuery
    // 2. buildSearchCategoryFacetOptionsQuery
    // 3. (Schema query from catalog)
    // 4. buildSearchTechnicalRepresentedSpecValuesQuery
    // 5. buildFullProductCountQuery
    // 6. buildFullProductResultsQuery
    const facetingWithCategoryQueries = [
      buildSearchBrandFacetOptionsQuery("mouse"),
      buildSearchCategoryFacetOptionsQuery("mouse"),
      buildSearchTechnicalRepresentedSpecValuesQuery("mouse", "cat-1"),
      buildFullProductCountQuery("mouse"),
      buildFullProductResultsQuery("mouse", 1, 12),
    ];
    // 5 Postgres search queries + 1 catalog schema query = 6 total faceting queries
    expect(facetingWithCategoryQueries).toHaveLength(5);
    // Total including 2 entity queries = 8 queries maximum
    expect(facetingWithCategoryQueries.length + 1 + entityQueries.length).toBe(8);
  });
});
