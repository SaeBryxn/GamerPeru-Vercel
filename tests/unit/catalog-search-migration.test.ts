import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("GP-012 — Search Migration and Schema Trigram Index Integrity", () => {
  it("defines the 4 canonical GIN trigram indexes in Drizzle catalog schema", () => {
    const productsConfig = getTableConfig(schema.products);
    const brandsConfig = getTableConfig(schema.brands);
    const categoriesConfig = getTableConfig(schema.categories);

    const productIndexNames = productsConfig.indexes.map((idx) => idx.config.name);
    const brandIndexNames = brandsConfig.indexes.map((idx) => idx.config.name);
    const categoryIndexNames = categoriesConfig.indexes.map((idx) => idx.config.name);

    expect(productIndexNames).toContain("products_name_trgm_idx");
    expect(productIndexNames).toContain("products_subtitle_trgm_idx");
    expect(brandIndexNames).toContain("brands_name_trgm_idx");
    expect(categoryIndexNames).toContain("categories_name_trgm_idx");

    // Verify index method is GIN
    const productsNameIdx = productsConfig.indexes.find(
      (idx) => idx.config.name === "products_name_trgm_idx"
    );
    const productsSubtitleIdx = productsConfig.indexes.find(
      (idx) => idx.config.name === "products_subtitle_trgm_idx"
    );
    const brandsNameIdx = brandsConfig.indexes.find(
      (idx) => idx.config.name === "brands_name_trgm_idx"
    );
    const categoriesNameIdx = categoriesConfig.indexes.find(
      (idx) => idx.config.name === "categories_name_trgm_idx"
    );

    expect(productsNameIdx?.config.method).toBe("gin");
    expect(productsSubtitleIdx?.config.method).toBe("gin");
    expect(brandsNameIdx?.config.method).toBe("gin");
    expect(categoriesNameIdx?.config.method).toBe("gin");
  });

  it("verifies 0001_search_pg_trgm.sql migration file exists and is pure", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0001_search_pg_trgm.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // 1. Must contain extension installation with explicit extensions schema
    expect(content).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;");

    // 2. Extension statement must precede all index creation statements
    const extIdx = content.indexOf("CREATE EXTENSION");
    const firstIdx = content.indexOf("CREATE INDEX");
    expect(extIdx).toBeGreaterThanOrEqual(0);
    expect(firstIdx).toBeGreaterThan(extIdx);

    // 3. Must contain exactly the 4 required indexes
    expect(content).toContain(
      'CREATE INDEX "brands_name_trgm_idx" ON "brands" USING gin ("name" extensions.gin_trgm_ops);'
    );
    expect(content).toContain(
      'CREATE INDEX "categories_name_trgm_idx" ON "categories" USING gin ("name" extensions.gin_trgm_ops);'
    );
    expect(content).toContain(
      'CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" extensions.gin_trgm_ops);'
    );
    expect(content).toContain(
      'CREATE INDEX "products_subtitle_trgm_idx" ON "products" USING gin ("subtitle" extensions.gin_trgm_ops);'
    );

    // 4. Must NOT contain IF NOT EXISTS on application indexes
    expect(content).not.toContain("CREATE INDEX IF NOT EXISTS");

    // 5. Must NOT contain any DML or unrelated DDL
    expect(content).not.toMatch(/INSERT\s+INTO/i);
    expect(content).not.toMatch(/UPDATE\s+/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
    expect(content).not.toMatch(/CREATE\s+TABLE/i);
    expect(content).not.toMatch(/DROP\s+/i);
    expect(content).not.toMatch(/ALTER\s+TABLE/i);
  });

  it("verifies Drizzle journal records migration 0001_search_pg_trgm", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries[0].tag).toBe("0000_superb_ink");
    expect(journal.entries[1].tag).toBe("0001_search_pg_trgm");
  });
});
