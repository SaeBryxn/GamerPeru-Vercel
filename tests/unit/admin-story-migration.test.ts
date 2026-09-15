import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { productStories, productStoryRevisions } from "@/db/schema";

const migrationPath = resolve(process.cwd(), "src/db/migrations/0014_steep_skreet.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

describe("GP-026 CHK1 Story lifecycle schema and migration", () => {
  it("defines the nullable draft pointer and all frozen relational constraints", () => {
    const storyColumns = getTableColumns(productStories);
    expect(storyColumns.draftRevisionId).toBeDefined();
    expect(storyColumns.draftRevisionId?.notNull).toBe(false);

    const storyConfig = getTableConfig(productStories);
    const foreignKeys = new Map(
      storyConfig.foreignKeys.map((foreignKey) => [foreignKey.getName(), foreignKey])
    );
    expect(foreignKeys.get("product_stories_published_revision_fk")?.onDelete).toBe("set null");
    expect(foreignKeys.get("product_stories_draft_revision_fk")?.onDelete).toBe("set null");
    expect(foreignKeys.get("product_stories_published_revision_product_fk")?.onDelete).toBe(
      "no action"
    );
    expect(foreignKeys.get("product_stories_draft_revision_product_fk")?.onDelete).toBe(
      "no action"
    );
    expect(storyConfig.checks.map((check) => check.name)).toContain(
      "product_stories_distinct_revision_pointers"
    );

    const revisionConfig = getTableConfig(productStoryRevisions);
    expect(revisionConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "product_story_revisions_product_revision_unique",
        "product_story_revisions_product_id_id_unique",
      ])
    );
    const indexNames = revisionConfig.indexes.map((index) => index.config.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "product_story_revisions_product_status_idx",
        "product_story_revisions_one_draft_per_product_idx",
        "product_story_revisions_one_published_per_product_idx",
      ])
    );
    expect(
      revisionConfig.indexes.find(
        (index) => index.config.name === "product_story_revisions_one_draft_per_product_idx"
      )?.config.where
    ).toBeDefined();
    expect(
      revisionConfig.indexes.find(
        (index) => index.config.name === "product_story_revisions_one_published_per_product_idx"
      )?.config.where
    ).toBeDefined();
  });

  it("places every fail-closed preflight before additive DDL and backfill", () => {
    const preflightCodes = [
      "GP026_CHK1_PREFLIGHT_CROSS_PRODUCT_PUBLISHED_POINTER",
      "GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_STATUS",
      "GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_TIMESTAMP",
      "GP026_CHK1_PREFLIGHT_MULTIPLE_DRAFTS",
      "GP026_CHK1_PREFLIGHT_MULTIPLE_PUBLISHED",
    ];
    for (const code of preflightCodes) {
      expect(migrationSql).toContain(code);
    }
    const ddlStart = migrationSql.indexOf('ALTER TABLE "product_stories" ADD COLUMN');
    expect(ddlStart).toBeGreaterThan(0);
    for (const code of preflightCodes) {
      expect(migrationSql.indexOf(code)).toBeLessThan(ddlStart);
    }
  });

  it("creates missing aggregates and backfills only an unambiguous single DRAFT", () => {
    expect(migrationSql).toContain(
      'INSERT INTO "product_stories" ("product_id", "published_revision_id", "updated_at")'
    );
    expect(migrationSql).toContain('ON CONFLICT ("product_id") DO NOTHING');
    expect(migrationSql).toContain('SET "draft_revision_id" = drafts."revision_id"');
    expect(migrationSql).toContain("WHERE \"status\" = 'DRAFT'");
    expect(migrationSql).toContain("HAVING COUNT(*) = 1");
    expect(migrationSql).not.toMatch(/DELETE\s+FROM/i);
    expect(migrationSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT)/i);
  });

  it("adds the ownership constraints before the composite foreign keys and both partial indexes", () => {
    const ownershipUnique = migrationSql.indexOf(
      'CONSTRAINT "product_story_revisions_product_id_id_unique"'
    );
    const publishedOwnershipFk = migrationSql.indexOf(
      'CONSTRAINT "product_stories_published_revision_product_fk"'
    );
    const draftOwnershipFk = migrationSql.indexOf(
      'CONSTRAINT "product_stories_draft_revision_product_fk"'
    );
    expect(ownershipUnique).toBeGreaterThan(0);
    expect(ownershipUnique).toBeLessThan(publishedOwnershipFk);
    expect(ownershipUnique).toBeLessThan(draftOwnershipFk);
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "product_story_revisions_one_draft_per_product_idx"'
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "product_story_revisions_one_published_per_product_idx"'
    );
  });

  it("records 0014 in the generated Drizzle journal and snapshot", () => {
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/db/migrations/meta/_journal.json"), "utf8")
    ) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.at(-1)).toEqual(
      expect.objectContaining({ idx: 14, tag: "0014_steep_skreet" })
    );

    const snapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/db/migrations/meta/0014_snapshot.json"), "utf8")
    ) as {
      tables: Record<
        string,
        {
          columns: Record<string, { notNull: boolean }>;
          foreignKeys: Record<string, { onDelete: string }>;
          indexes: Record<string, { isUnique: boolean; where?: string }>;
        }
      >;
    };
    const stories = snapshot.tables["public.product_stories"];
    const revisions = snapshot.tables["public.product_story_revisions"];
    expect(stories?.columns.draft_revision_id?.notNull).toBe(false);
    expect(stories?.foreignKeys).toHaveProperty("product_stories_draft_revision_product_fk");
    expect(revisions?.indexes).toHaveProperty("product_story_revisions_one_draft_per_product_idx");
    expect(revisions?.indexes).toHaveProperty(
      "product_story_revisions_one_published_per_product_idx"
    );
  });
});
