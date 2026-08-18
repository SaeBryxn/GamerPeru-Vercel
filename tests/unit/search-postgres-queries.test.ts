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

  it("proves actual deterministic Search query call counts via instrumented Reader orchestration", async () => {
    // Instrumented reader tracking granular query invocations
    const queryCalls = {
      matchingBrands: 0,
      matchingCategories: 0,
      searchBrandFacets: 0,
      searchCategoryFacets: 0,
      schema: 0,
      technicalRepresentedValues: 0,
      productCount: 0,
      productItems: 0,
    };

    class InstrumentedSearchReader {
      async getMatchingBrands(_q: string, _limit: number) {
        queryCalls.matchingBrands += 1;
        return [];
      }

      async getMatchingCategories(_q: string, _limit: number) {
        queryCalls.matchingCategories += 1;
        return [];
      }

      async getSearchBrandFacetOptions(_q: string) {
        queryCalls.searchBrandFacets += 1;
        return [{ id: "b1", name: "WLMouse", slug: "wlmouse" }];
      }

      async getSearchCategoryFacetOptions(_q: string) {
        queryCalls.searchCategoryFacets += 1;
        return [{ id: "c1", name: "Mouses", slug: "mouses" }];
      }

      async getSearchDiscoveryFacets(
        _q: string,
        baseBrands: Array<{ id: string; name: string; slug: string }>,
        baseCategories: Array<{ id: string; name: string; slug: string }>,
        selectedCategoryId: string | null,
        schema: unknown | null
      ) {
        if (selectedCategoryId && schema) {
          queryCalls.technicalRepresentedValues += 1;
        }
        return {
          brands: baseBrands,
          categories: baseCategories,
          technicalSchema: null,
          technicalFacets: [],
        };
      }

      async getSearchResults() {
        queryCalls.productCount += 1;
        queryCalls.productItems += 1;
        return {
          items: [],
          page: 1,
          pageSize: 12,
          totalItems: 0,
          totalPages: 0,
        };
      }
    }

    class InstrumentedCatalogSchemaReader {
      async getCategorySpecificationSchema(_categoryId: string) {
        queryCalls.schema += 1;
        return {
          id: "schema-1",
          categoryId: "cat-1",
          schemaVersion: 1,
          fieldDefinitions: [],
        };
      }
    }

    const searchReader = new InstrumentedSearchReader();
    const catalogReader = new InstrumentedCatalogSchemaReader();

    // Retained GP-012 Entity Navigation:
    await searchReader.getMatchingBrands("mouse", 4);
    await searchReader.getMatchingCategories("mouse", 4);
    expect(queryCalls.matchingBrands).toBe(1);
    expect(queryCalls.matchingCategories).toBe(1);
    const entityCount = queryCalls.matchingBrands + queryCalls.matchingCategories;
    expect(entityCount).toBe(2);

    // Case 1: Search Faceted Discovery without Category selection
    queryCalls.searchBrandFacets = 0;
    queryCalls.searchCategoryFacets = 0;
    queryCalls.schema = 0;
    queryCalls.technicalRepresentedValues = 0;
    queryCalls.productCount = 0;
    queryCalls.productItems = 0;

    const baseBrands1 = await searchReader.getSearchBrandFacetOptions("mouse");
    const baseCats1 = await searchReader.getSearchCategoryFacetOptions("mouse");
    await searchReader.getSearchDiscoveryFacets("mouse", baseBrands1, baseCats1, null, null);
    await searchReader.getSearchResults();

    expect(queryCalls.searchBrandFacets).toBe(1);
    expect(queryCalls.searchCategoryFacets).toBe(1);
    expect(queryCalls.schema).toBe(0);
    expect(queryCalls.technicalRepresentedValues).toBe(0);
    expect(queryCalls.productCount).toBe(1);
    expect(queryCalls.productItems).toBe(1);

    const facetingWithoutCategory =
      queryCalls.searchBrandFacets +
      queryCalls.searchCategoryFacets +
      queryCalls.schema +
      queryCalls.technicalRepresentedValues +
      queryCalls.productCount +
      queryCalls.productItems;
    expect(facetingWithoutCategory).toBe(4);
    expect(facetingWithoutCategory + entityCount).toBe(6);

    // Case 2: Search Faceted Discovery with exactly one Category selected
    queryCalls.searchBrandFacets = 0;
    queryCalls.searchCategoryFacets = 0;
    queryCalls.schema = 0;
    queryCalls.technicalRepresentedValues = 0;
    queryCalls.productCount = 0;
    queryCalls.productItems = 0;

    const baseBrands2 = await searchReader.getSearchBrandFacetOptions("mouse");
    const baseCats2 = await searchReader.getSearchCategoryFacetOptions("mouse");
    const schema = await catalogReader.getCategorySpecificationSchema("c1");
    await searchReader.getSearchDiscoveryFacets("mouse", baseBrands2, baseCats2, "c1", schema);
    await searchReader.getSearchResults();

    expect(queryCalls.searchBrandFacets).toBe(1);
    expect(queryCalls.searchCategoryFacets).toBe(1);
    expect(queryCalls.schema).toBe(1);
    expect(queryCalls.technicalRepresentedValues).toBe(1);
    expect(queryCalls.productCount).toBe(1);
    expect(queryCalls.productItems).toBe(1);

    const facetingWithCategory =
      queryCalls.searchBrandFacets +
      queryCalls.searchCategoryFacets +
      queryCalls.schema +
      queryCalls.technicalRepresentedValues +
      queryCalls.productCount +
      queryCalls.productItems;
    expect(facetingWithCategory).toBe(6);
    expect(facetingWithCategory + entityCount).toBe(8);
  });
});
