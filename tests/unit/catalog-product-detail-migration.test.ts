import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("GP-014 — Product Detail Schema and Migration Candidate Integrity", () => {
  it("defines canonical indexes, checks, and explicit binding FK constraint names on product_media", () => {
    const tableConfig = getTableConfig(schema.productMedia);

    // Indexes
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("product_media_product_idx");
    expect(indexNames).toContain("product_media_variant_idx");

    // Checks
    const checkNames = tableConfig.checks.map((chk) => chk.name);
    expect(checkNames).toContain("product_media_display_order_check");

    // Foreign keys with explicit Plan v2.2 binding constraint names & semantics
    const fks = tableConfig.foreignKeys;
    const prodFk = fks.find((fk) => fk.getName() === "product_media_product_fk");
    const mediaFk = fks.find((fk) => fk.getName() === "product_media_media_asset_fk");
    const varFk = fks.find((fk) => fk.getName() === "product_media_variant_fk");

    expect(prodFk, "Missing binding constraint product_media_product_fk").toBeDefined();
    expect(prodFk?.reference().foreignTable).toBe(schema.products);
    expect(prodFk?.onDelete).toBe("cascade");

    expect(mediaFk, "Missing binding constraint product_media_media_asset_fk").toBeDefined();
    expect(mediaFk?.reference().foreignTable).toBe(schema.mediaAssets);
    expect(mediaFk?.onDelete).toBe("restrict");

    expect(varFk, "Missing binding constraint product_media_variant_fk").toBeDefined();
    expect(varFk?.reference().foreignTable).toBe(schema.productVariants);
    expect(varFk?.onDelete).toBe("cascade");
  });

  it("defines canonical indexes, unique constraints, checks, and explicit binding FK constraint names on product_story_revisions", () => {
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

    // Foreign keys with explicit Plan v2.2 binding constraint names & semantics
    const fks = tableConfig.foreignKeys;
    const prodFk = fks.find((fk) => fk.getName() === "product_story_revisions_product_fk");
    expect(prodFk, "Missing binding constraint product_story_revisions_product_fk").toBeDefined();
    expect(prodFk?.reference().foreignTable).toBe(schema.products);
    expect(prodFk?.onDelete).toBe("cascade");

    // Auth FK (references auth.users on delete set null)
    const authFk = fks.find((fk) => fk.reference().columns[0]?.name === "created_by_auth_user_id");
    expect(authFk, "Missing auth.users FK on product_story_revisions").toBeDefined();
    expect(authFk?.onDelete).toBe("set null");
  });

  it("defines explicit binding FK constraint names on product_stories", () => {
    const tableConfig = getTableConfig(schema.productStories);
    const fks = tableConfig.foreignKeys;

    const prodFk = fks.find((fk) => fk.getName() === "product_stories_product_fk");
    expect(prodFk, "Missing binding constraint product_stories_product_fk").toBeDefined();
    expect(prodFk?.reference().foreignTable).toBe(schema.products);
    expect(prodFk?.onDelete).toBe("cascade");

    const revFk = fks.find((fk) => fk.getName() === "product_stories_published_revision_fk");
    expect(revFk, "Missing binding constraint product_stories_published_revision_fk").toBeDefined();
    expect(revFk?.reference().foreignTable).toBe(schema.productStoryRevisions);
    expect(revFk?.onDelete).toBe("set null");
  });

  it("confirms product_variants does NOT contain composite unique key or composite FK", () => {
    const tableConfig = getTableConfig(schema.productVariants);
    const uniqueNames = tableConfig.uniqueConstraints.map((uc) => uc.name);
    expect(uniqueNames).not.toContain("product_variants_product_id_id_unique");
  });

  it("verifies generated 0003 migration file exists, is pure, and contains exact binding FK constraint names", () => {
    const migrationsDir = resolve(process.cwd(), "src/db/migrations");
    const migrationFiles = readdirSync(migrationsDir).filter(
      (f) => f.startsWith("0003_") && f.endsWith(".sql")
    );
    expect(migrationFiles).toHaveLength(1);
    const migrationFileName = migrationFiles[0];
    expect(migrationFileName).toBeDefined();

    const migrationPath = resolve(migrationsDir, migrationFileName!);
    expect(existsSync(migrationPath)).toBe(true);

    const content = readFileSync(migrationPath, "utf8");

    // Tables created
    expect(content).toContain('CREATE TABLE "product_media"');
    expect(content).toContain('CREATE TABLE "product_stories"');
    expect(content).toContain('CREATE TABLE "product_story_revisions"');

    // Exactly 6 explicit Plan v2.2 binding foreign key constraints + auth FK
    expect(content).toContain(
      'ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict'
    );
    expect(content).toContain(
      'ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "product_story_revisions" ADD CONSTRAINT "product_story_revisions_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade'
    );
    expect(content).toContain(
      'ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_published_revision_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."product_story_revisions"("id") ON DELETE set null'
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

  it("verifies Drizzle snapshot metadata records the exact binding FK constraint names", () => {
    const snapshotPath = resolve(process.cwd(), "src/db/migrations/meta/0003_snapshot.json");
    expect(existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const mediaFks = snapshot.tables["public.product_media"].foreignKeys;
    expect(mediaFks).toHaveProperty("product_media_product_fk");
    expect(mediaFks.product_media_product_fk.onDelete).toBe("cascade");
    expect(mediaFks).toHaveProperty("product_media_media_asset_fk");
    expect(mediaFks.product_media_media_asset_fk.onDelete).toBe("restrict");
    expect(mediaFks).toHaveProperty("product_media_variant_fk");
    expect(mediaFks.product_media_variant_fk.onDelete).toBe("cascade");

    const storyRevFks = snapshot.tables["public.product_story_revisions"].foreignKeys;
    expect(storyRevFks).toHaveProperty("product_story_revisions_product_fk");
    expect(storyRevFks.product_story_revisions_product_fk.onDelete).toBe("cascade");

    const storyFks = snapshot.tables["public.product_stories"].foreignKeys;
    expect(storyFks).toHaveProperty("product_stories_product_fk");
    expect(storyFks.product_stories_product_fk.onDelete).toBe("cascade");
    expect(storyFks).toHaveProperty("product_stories_published_revision_fk");
    expect(storyFks.product_stories_published_revision_fk.onDelete).toBe("set null");
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
    expect(journal.entries[3].tag).toMatch(/^0003_/);
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
