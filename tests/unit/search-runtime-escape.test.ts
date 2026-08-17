import { describe, expect, it } from "vitest";
import postgres from "postgres";
import * as dotenv from "dotenv";
import {
  buildPredictiveProductsQuery,
  buildPredictiveBrandsQuery,
  buildPredictiveCategoriesQuery,
  buildFullProductCountQuery,
  buildFullProductResultsQuery,
} from "@/lib/search/postgres-queries";

dotenv.config({ path: ".env.local" });

const dbUrl = process.env.DATABASE_URL;

describe("GP-012 — PostgreSQL ESCAPE Semantics and Runtime Smoke", () => {
  it("inspects exact .toSQL() output for LIKE ESCAPE syntax across all builders", () => {
    const predProd = buildPredictiveProductsQuery("mouse", 6).toSQL();
    const predBrands = buildPredictiveBrandsQuery("mouse", 3).toSQL();
    const predCats = buildPredictiveCategoriesQuery("mouse", 3).toSQL();
    const fullCount = buildFullProductCountQuery("mouse").toSQL();
    const fullResults = buildFullProductResultsQuery("mouse", 1, 12).toSQL();

    // Verify ESCAPE clause in SQL strings
    expect(predProd.sql).toContain("ESCAPE '\\'");
    expect(predBrands.sql).toContain("ESCAPE '\\'");
    expect(predCats.sql).toContain("ESCAPE '\\'");
    expect(fullCount.sql).toContain("ESCAPE '\\'");
    expect(fullResults.sql).toContain("ESCAPE '\\'");
  });

  it.skipIf(!dbUrl)(
    "verifies standard_conforming_strings and runtime query execution against PostgreSQL",
    { timeout: 30000 },
    async () => {
      const sql = postgres(dbUrl!, {
        ssl: "require",
        prepare: false,
      });

      try {
        // 1. Verify standard_conforming_strings = on
        const [scs] = await sql`SHOW standard_conforming_strings;`;
        expect(scs.standard_conforming_strings).toBe("on");

        // 2. Test literal LIKE escaping behavior on PostgreSQL 17 with %, _, and \
        const samples = await sql`
        WITH sample_rows(val) AS (
          VALUES 
            ('100% Cotton'), 
            ('1000 Cotton'), 
            ('mouse_model_1'), 
            ('mouse-model-1'), 
            ('C:\\test\\dir'), 
            ('C:testdir')
        )
        SELECT 
          (SELECT count(*)::int FROM sample_rows WHERE val ILIKE '%100\\%%' ESCAPE '\\') as match_percent,
          (SELECT count(*)::int FROM sample_rows WHERE val ILIKE '%mouse\\_model\\_1%' ESCAPE '\\') as match_underscore,
          (SELECT count(*)::int FROM sample_rows WHERE val ILIKE '%C:\\\\test%' ESCAPE '\\') as match_backslash;
      `;

        // %100\%% should match only '100% Cotton' (1 row)
        expect(samples[0].match_percent).toBe(1);

        // %mouse\_model\_1% should match only 'mouse_model_1' (1 row)
        expect(samples[0].match_underscore).toBe(1);

        // %C:\\test% should match only 'C:\test\dir' (1 row)
        expect(samples[0].match_backslash).toBe(1);

        // 3. Execute all production builders with special characters against PostgreSQL
        const inputs = ["mouse", "100%", "mouse_model", "C:\\test", "test%_\\end", "8k"];

        for (const input of inputs) {
          const prodQ = buildPredictiveProductsQuery(input, 6).toSQL();
          const prodRows = await sql.unsafe(prodQ.sql, prodQ.params as unknown[]);
          expect(Array.isArray(prodRows)).toBe(true);

          const countQ = buildFullProductCountQuery(input).toSQL();
          const countRows = await sql.unsafe(countQ.sql, countQ.params as unknown[]);
          expect(Array.isArray(countRows)).toBe(true);

          const fullQ = buildFullProductResultsQuery(input, 1, 12).toSQL();
          const fullRows = await sql.unsafe(fullQ.sql, fullQ.params as unknown[]);
          expect(Array.isArray(fullRows)).toBe(true);

          const brandQ = buildPredictiveBrandsQuery(input, 3).toSQL();
          const brandRows = await sql.unsafe(brandQ.sql, brandQ.params as unknown[]);
          expect(Array.isArray(brandRows)).toBe(true);

          const catQ = buildPredictiveCategoriesQuery(input, 3).toSQL();
          const catRows = await sql.unsafe(catQ.sql, catQ.params as unknown[]);
          expect(Array.isArray(catRows)).toBe(true);
        }
      } finally {
        await sql.end();
      }
    }
  );
});
