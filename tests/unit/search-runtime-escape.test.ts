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

type PostgresUnsafeParams = Parameters<postgres.Sql["unsafe"]>[1];

function toUnsafeParams(params: readonly unknown[]): PostgresUnsafeParams {
  return params as PostgresUnsafeParams;
}

describe("GP-012 — PostgreSQL ESCAPE Semantics and Runtime Smoke", () => {
  it("inspects exact .toSQL() output for LIKE ESCAPE syntax across all builders", () => {
    const predProd = buildPredictiveProductsQuery("mouse", 6).toSQL();
    const predBrands = buildPredictiveBrandsQuery("mouse", 3).toSQL();
    const predCats = buildPredictiveCategoriesQuery("mouse", 3).toSQL();
    const fullCount = buildFullProductCountQuery("mouse").toSQL();
    const fullResults = buildFullProductResultsQuery("mouse", 1, 12).toSQL();

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
      let isLocal = false;
      try {
        const parsed = new URL(dbUrl!);
        isLocal = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
      } catch {
        // Fall back to default
      }

      const sql = postgres(dbUrl!, {
        ssl: isLocal ? false : "require",
        prepare: false,
      });

      try {
        const scsRows = await sql`SHOW standard_conforming_strings;`;
        const scs = scsRows[0];
        if (!scs) {
          throw new Error("Expected standard_conforming_strings configuration row");
        }
        expect(scs.standard_conforming_strings).toBe("on");

        const sampleRows = await sql`
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

        const sample = sampleRows[0];
        if (!sample) {
          throw new Error("Expected CTE sample query row");
        }

        expect(sample.match_percent).toBe(1);
        expect(sample.match_underscore).toBe(1);
        expect(sample.match_backslash).toBe(1);

        const inputs = ["mouse", "100%", "mouse_model", "C:\\test", "test%_\\end", "8k"];

        for (const input of inputs) {
          const prodQ = buildPredictiveProductsQuery(input, 6).toSQL();
          const prodRows = await sql.unsafe(prodQ.sql, toUnsafeParams(prodQ.params));
          expect(Array.isArray(prodRows)).toBe(true);

          const countQ = buildFullProductCountQuery(input).toSQL();
          const countRows = await sql.unsafe(countQ.sql, toUnsafeParams(countQ.params));
          expect(Array.isArray(countRows)).toBe(true);

          const fullQ = buildFullProductResultsQuery(input, 1, 12).toSQL();
          const fullRows = await sql.unsafe(fullQ.sql, toUnsafeParams(fullQ.params));
          expect(Array.isArray(fullRows)).toBe(true);

          const brandQ = buildPredictiveBrandsQuery(input, 3).toSQL();
          const brandRows = await sql.unsafe(brandQ.sql, toUnsafeParams(brandQ.params));
          expect(Array.isArray(brandRows)).toBe(true);

          const catQ = buildPredictiveCategoriesQuery(input, 3).toSQL();
          const catRows = await sql.unsafe(catQ.sql, toUnsafeParams(catQ.params));
          expect(Array.isArray(catRows)).toBe(true);
        }
      } finally {
        await sql.end();
      }
    }
  );
});
