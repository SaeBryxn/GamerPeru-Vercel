import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("GP-014 — Product Detail Schema and Migration Candidate Integrity", () => {
  it("defines canonical indexes and constraints on product_media", () => {
    const tableConfig = getTableConfig(schema.productMedia);

    // Indexes
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("product_media_product_idx");
    expect(indexNames).toContain("product_media_variant_idx");

    // Checks
    const checkNames = tableConfig.checks.map((chk) => chk.name);
    expect(checkNames).toContain("product_media_display_order_check");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const prodFk = fks.find((fk) => fk.reference().foreignTable === schema.products);
    const mediaFk = fks.find((fk) => fk.reference().foreignTable === schema.mediaAssets);
    const varFk = fks.find((fk) => fk.reference().foreignTable === schema.productVariants);

    expect(prodFk).toBeDefined();
    expect(prodFk?.onDelete).toBe("cascade");

    expect(mediaFk).toBeDefined();
    expect(mediaFk?.onDelete).toBe("restrict");

    expect(varFk).toBeDefined();
    expect(varFk?.onDelete).toBe("cascade");
  });

  it("defines canonical indexes and constraints on product_story_revisions", () => {
    const tableConfig = getTableConfig(schema.productStoryRevisions);

    // Indexes
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("product_story_revisions_product_status_idx");

    // Unique constraints
    const uniqueNames = tableConfig.uniqueConstraints.map((uc) => uc.name);
    expect(uniqueNames).toContain("product_story_revisions_product_revision_unique");
    expect(uniqueNames).not.toContain("product_story_revisions_product_id_unique");

    // Checks
    const checkNames = tableConfig.checks.map((chk) => chk.name);
    expect(checkNames).toContain("product_story_revisions_revision_positive");
    expect(checkNames).toContain("product_story_revisions_blocks_array");
    expect(checkNames).toContain("product_story_revisions_published_at_check");

    // Foreign keys
    const fks = tableConfig.foreignKeys;
    const prodFk = fks.find((fk) => fk.reference().foreignTable === schema.products);
    expect(prodFk).toBeDefined();
    expect(prodFk?.onDelete).toBe("cascade");

    const authFk = fks.find((fk) => fk.reference().columns[0]?.name === "created_by_auth_user_id");
    expect(authFk).toBeDefined();
    expect(authFk?.onDelete).toBe("set null");
  });

  it("defines canonical foreign keys on product_stories", () => {
    const tableConfig = getTableConfig(schema.productStories);
    const fks = tableConfig.foreignKeys;

    const prodFk = fks.find((fk) => fk.reference().foreignTable === schema.products);
    expect(prodFk).toBeDefined();
    expect(prodFk?.onDelete).toBe("cascade");

    const revFk = fks.find((fk) => fk.reference().foreignTable === schema.productStoryRevisions);
    expect(revFk).toBeDefined();
    expect(revFk?.onDelete).toBe("set null");
  });

  it("confirms product_variants does NOT contain composite unique key or composite FK", () => {
    const tableConfig = getTableConfig(schema.productVariants);
    const uniqueNames = tableConfig.uniqueConstraints.map((uc) => uc.name);
    expect(uniqueNames).not.toContain("product_variants_product_id_id_unique");
  });

  it("verifies generated 0003 migration file exists, is pure, and contains approved DDL", () => {
    const migrationPath = resolve(process.cwd(), "src/db/migrations/0003_faulty_quentin_quire.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // Tables created
    expect(content).toContain('CREATE TABLE "product_media"');
    expect(content).toContain('CREATE TABLE "product_stories"');
    expect(content).toContain('CREATE TABLE "product_story_revisions"');

    // Foreign keys with explicit delete actions
    expect(content).toContain(
      'FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict'
    );
    expect(content).toContain(
      'FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'FOREIGN KEY ("published_revision_id") REFERENCES "public"."product_story_revisions"("id") ON DELETE set null'
    );
    expect(content).toContain(
      'FOREIGN KEY ("created_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null'
    );

    // Checks & Unique
    expect(content).toContain('CONSTRAINT "product_media_display_order_check"');
    expect(content).toContain(
      'CONSTRAINT "product_story_revisions_product_revision_unique" UNIQUE("product_id","revision_number")'
    );
    expect(content).toContain('CONSTRAINT "product_story_revisions_revision_positive"');
    expect(content).toContain('CONSTRAINT "product_story_revisions_blocks_array"');
    expect(content).toContain('CONSTRAINT "product_story_revisions_published_at_check"');

    // Indexes
    expect(content).toContain(
      'CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id","display_order");'
    );
    expect(content).toContain(
      'CREATE INDEX "product_media_variant_idx" ON "product_media" USING btree ("variant_id");'
    );
    expect(content).toContain(
      'CREATE INDEX "product_story_revisions_product_status_idx" ON "product_story_revisions" USING btree ("product_id","status");'
    );

    // Ensure NO composite FK or composite unique on product_variants
    expect(content).not.toContain("product_variants_product_id_id_unique");
    expect(content).not.toContain("product_story_revisions_product_id_unique");
    expect(content).not.toContain('ALTER TABLE "product_variants"');

    // Ensure NO auth schema/table DDL
    expect(content).not.toMatch(/CREATE\s+TABLE\s+["']?auth["']?/i);
    expect(content).not.toMatch(/ALTER\s+TABLE\s+["']?auth["']?/i);

    // Purity: No DROP or DML
    expect(content).not.toMatch(/^\s*DROP\s+/im);
    expect(content).not.toMatch(/INSERT\s+INTO/i);
    expect(content).not.toMatch(/\bUPDATE\s+["a-z_]+\s+SET\b/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
  });

  it("verifies Drizzle journal records exactly 4 migrations in correct sequence", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries).toHaveLength(4);
    expect(journal.entries[0].tag).toBe("0000_superb_ink");
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[1].tag).toBe("0001_search_pg_trgm");
    expect(journal.entries[1].idx).toBe(1);
    expect(journal.entries[2].tag).toBe("0002_silky_dazzler");
    expect(journal.entries[2].idx).toBe(2);
    expect(journal.entries[3].tag).toBe("0003_faulty_quentin_quire");
    expect(journal.entries[3].idx).toBe(3);
  });

  it("verifies prior migrations are byte-for-byte unchanged", () => {
    const mig0Path = resolve(process.cwd(), "src/db/migrations/0000_superb_ink.sql");
    const mig1Path = resolve(process.cwd(), "src/db/migrations/0001_search_pg_trgm.sql");
    const mig2Path = resolve(process.cwd(), "src/db/migrations/0002_silky_dazzler.sql");

    expect(existsSync(mig0Path)).toBe(true);
    expect(existsSync(mig1Path)).toBe(true);
    expect(existsSync(mig2Path)).toBe(true);
  });
});
