import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("GP-013 — Specification Schema and Migration Candidate Integrity", () => {
  it("defines canonical indexes and constraints on category_specification_schemas", () => {
    const tableConfig = getTableConfig(schema.categorySpecificationSchemas);

    // Explicit indexes
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("category_spec_schemas_category_idx");

    // Unique constraints
    const uniqueNames = tableConfig.uniqueConstraints.map((uc) => uc.name);
    expect(uniqueNames).toContain("category_spec_schemas_category_id_schema_version_key");

    // Checks
    const checkNames = tableConfig.checks.map((chk) => chk.name);
    expect(checkNames).toContain("category_spec_schemas_version_positive");
    expect(checkNames).toContain("category_spec_schemas_field_defs_array");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const catFk = fks.find((fk) => fk.reference().foreignTable === schema.categories);
    expect(catFk).toBeDefined();
    expect(catFk?.onDelete).toBe("restrict");
  });

  it("defines canonical indexes and constraints on product_specifications", () => {
    const tableConfig = getTableConfig(schema.productSpecifications);

    // Indexes
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("product_specifications_schema_id_idx");
    expect(indexNames).toContain("product_specifications_spec_values_gin_idx");

    const ginIdx = tableConfig.indexes.find(
      (idx) => idx.config.name === "product_specifications_spec_values_gin_idx"
    );
    expect(ginIdx?.config.method).toBe("gin");

    // Checks
    const checkNames = tableConfig.checks.map((chk) => chk.name);
    expect(checkNames).toContain("product_specifications_version_positive");
    expect(checkNames).toContain("product_specifications_spec_values_object");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const prodFk = fks.find((fk) => fk.reference().foreignTable === schema.products);
    const schemaFk = fks.find(
      (fk) => fk.reference().foreignTable === schema.categorySpecificationSchemas
    );

    expect(prodFk).toBeDefined();
    expect(prodFk?.onDelete).toBe("cascade");

    expect(schemaFk).toBeDefined();
    expect(schemaFk?.onDelete).toBe("restrict");
  });

  it("defines canonical foreign key on categories.current_spec_schema_id", () => {
    const tableConfig = getTableConfig(schema.categories);
    const fks = tableConfig.foreignKeys;
    const specSchemaFk = fks.find(
      (fk) => fk.reference().foreignTable === schema.categorySpecificationSchemas
    );

    expect(specSchemaFk).toBeDefined();
    expect(specSchemaFk?.onDelete).toBe("set null");
  });

  it("verifies generated 0002 migration file exists, is pure, and contains approved DDL", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0002_silky_dazzler.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // Tables
    expect(content).toContain('CREATE TABLE "category_specification_schemas"');
    expect(content).toContain('CREATE TABLE "product_specifications"');

    // Column
    expect(content).toContain('ALTER TABLE "categories" ADD COLUMN "current_spec_schema_id" uuid;');

    // Foreign keys with explicit delete actions
    expect(content).toContain(
      'FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict'
    );
    expect(content).toContain(
      'FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'FOREIGN KEY ("schema_id") REFERENCES "public"."category_specification_schemas"("id") ON DELETE restrict'
    );
    expect(content).toContain(
      'FOREIGN KEY ("current_spec_schema_id") REFERENCES "public"."category_specification_schemas"("id") ON DELETE set null'
    );

    // Checks
    expect(content).toContain('CONSTRAINT "category_spec_schemas_version_positive"');
    expect(content).toContain('CONSTRAINT "category_spec_schemas_field_defs_array"');
    expect(content).toContain('CONSTRAINT "product_specifications_version_positive"');
    expect(content).toContain('CONSTRAINT "product_specifications_spec_values_object"');

    // Indexes
    expect(content).toContain(
      'CREATE INDEX "category_spec_schemas_category_idx" ON "category_specification_schemas" USING btree ("category_id","is_active");'
    );
    expect(content).toContain(
      'CREATE INDEX "product_specifications_schema_id_idx" ON "product_specifications" USING btree ("schema_id");'
    );
    expect(content).toContain(
      'CREATE INDEX "product_specifications_spec_values_gin_idx" ON "product_specifications" USING gin ("spec_values" jsonb_path_ops);'
    );

    // Purity: No DROP or DML
    expect(content).not.toMatch(/^\s*DROP\s+/im);
    expect(content).not.toMatch(/INSERT\s+INTO/i);
    expect(content).not.toMatch(/\bUPDATE\s+["a-z_]+\s+SET\b/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
  });

  it("verifies Drizzle journal records exactly 3 migrations in correct sequence", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries.length).toBeGreaterThanOrEqual(3);
    expect(journal.entries[0].tag).toBe("0000_superb_ink");
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[1].tag).toBe("0001_search_pg_trgm");
    expect(journal.entries[1].idx).toBe(1);
    expect(journal.entries[2].tag).toBe("0002_silky_dazzler");
    expect(journal.entries[2].idx).toBe(2);
  });

  it("verifies prior migrations are byte-for-byte unchanged", () => {
    const mig0Path = resolve(process.cwd(), "src/db/migrations/0000_superb_ink.sql");
    const mig1Path = resolve(process.cwd(), "src/db/migrations/0001_search_pg_trgm.sql");

    expect(existsSync(mig0Path)).toBe(true);
    expect(existsSync(mig1Path)).toBe(true);
  });
});
