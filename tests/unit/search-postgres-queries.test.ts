import { describe, expect, it } from "vitest";
import {
  buildFullMatchingBrandsQuery,
  buildFullMatchingCategoriesQuery,
  buildFullProductCountQuery,
  buildFullProductResultsQuery,
  buildPredictiveBrandsQuery,
  buildPredictiveCategoriesQuery,
  buildPredictiveProductsQuery,
} from "@/lib/search/postgres-queries";

describe("GP-012 — PostgreSQL Production Search Query Builders", () => {
  it("builds predictive products query with publication and active variant filters", () => {
    const query = buildPredictiveProductsQuery("mouse", 6);
    const sqlObj = query.toSQL();

    // 1. Must enforce PUBLISHED on products, brands, and categories
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"brands"."status" = $');
    expect(sqlObj.sql).toContain('"categories"."status" = $');

    // 2. Must enforce ACTIVE on product_variants
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');

    // 3. Must enforce PUBLIC_MEDIA and IMAGE on media_assets
    expect(sqlObj.sql).toContain('"media_assets"."security_class" = $');
    expect(sqlObj.sql).toContain('"media_assets"."media_type" = $');

    // 4. Must select min price
    expect(sqlObj.sql).toContain('min("product_variants"."price_cents")');

    // 5. Must NOT select cost_cents or supplier metadata
    expect(sqlObj.sql).not.toContain("cost_cents");
    expect(sqlObj.sql).not.toContain("supplier");

    // 6. For length >= 3, must include extensions.word_similarity ranking
    expect(sqlObj.sql).toContain("extensions.word_similarity");

    // 7. Must have limit 6
    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.params).toContain(6);
  });

  it("builds predictive products query for 2-character query WITHOUT word_similarity", () => {
    const query = buildPredictiveProductsQuery("8k", 6);
    const sqlObj = query.toSQL();

    // Must NOT contain word_similarity on length == 2 path
    expect(sqlObj.sql).not.toContain("word_similarity");
    expect(sqlObj.sql).toContain("ILIKE");
    expect(sqlObj.sql).toContain("ESCAPE '\\'");
  });

  it("builds full product count query", () => {
    const query = buildFullProductCountQuery("teclado");
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('count(distinct "products"."id")');
    expect(sqlObj.sql).toContain('"products"."status" = $');
    expect(sqlObj.sql).toContain('"product_variants"."status" = $');
  });

  it("builds full paginated product results query with LIMIT and OFFSET", () => {
    const query = buildFullProductResultsQuery("mousepad", 2, 12);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain("limit $");
    expect(sqlObj.sql).toContain("offset $");
    expect(sqlObj.params).toContain(12);
    expect(sqlObj.params).toContain(12); // offset = (2 - 1) * 12 = 12
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

    const catQuery = buildFullMatchingCategoriesQuery("audio", 4);
    const catSql = catQuery.toSQL();
    expect(catSql.sql).toContain('"categories"."status" = $');
    expect(catSql.sql).toContain("limit $");
    expect(catSql.params).toContain(4);
  });

  it("builds brand query matching name and slug", () => {
    const query = buildFullMatchingBrandsQuery("marca-qa", 4);
    const sqlObj = query.toSQL();

    expect(sqlObj.sql).toContain('"brands"."name" ILIKE');
    expect(sqlObj.sql).toContain('"brands"."slug" = $');
  });
});
