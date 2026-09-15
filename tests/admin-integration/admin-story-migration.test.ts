import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";

const migrationSql = readFileSync(
  resolve(process.cwd(), "src/db/migrations/0014_steep_skreet.sql"),
  "utf8"
);
const migrationStatements = migrationSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

interface LegacyFixture {
  schema: string;
  productA: string;
  productB: string;
  productC: string;
}

describe("GP-026 CHK1 migration live integration", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let pgSql: postgres.Sql;

  beforeAll(() => {
    pgSql = postgres(databaseUrl, { max: 4, prepare: false, onnotice: () => undefined });
  });

  afterAll(async () => {
    await pgSql.end();
  });

  function assertTestSchema(schema: string): void {
    if (!/^gp026_chk1_migration_[0-9a-f]{32}$/.test(schema)) {
      throw new Error("Unsafe migration-test schema name");
    }
  }

  async function createLegacyFixture(): Promise<LegacyFixture> {
    const schema = `gp026_chk1_migration_${randomUUID().replaceAll("-", "")}`;
    assertTestSchema(schema);
    await pgSql.unsafe(`CREATE SCHEMA "${schema}"`);
    await pgSql.unsafe(`
      CREATE TABLE "${schema}"."products" (
        "id" uuid PRIMARY KEY NOT NULL
      )
    `);
    await pgSql.unsafe(`
      CREATE TABLE "${schema}"."product_story_revisions" (
        "id" uuid PRIMARY KEY NOT NULL,
        "product_id" uuid NOT NULL,
        "revision_number" integer NOT NULL,
        "status" "public"."catalog_status" DEFAULT 'DRAFT' NOT NULL,
        "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "published_at" timestamp with time zone,
        "created_by_auth_user_id" uuid,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "product_story_revisions_product_revision_unique"
          UNIQUE ("product_id", "revision_number"),
        CONSTRAINT "product_story_revisions_revision_positive"
          CHECK ("revision_number" > 0),
        CONSTRAINT "product_story_revisions_blocks_array"
          CHECK (jsonb_typeof("blocks") = 'array'),
        CONSTRAINT "product_story_revisions_published_at_check"
          CHECK ("status" != 'PUBLISHED' OR "published_at" IS NOT NULL),
        CONSTRAINT "product_story_revisions_product_fk"
          FOREIGN KEY ("product_id") REFERENCES "${schema}"."products"("id") ON DELETE CASCADE
      )
    `);
    await pgSql.unsafe(`
      CREATE TABLE "${schema}"."product_stories" (
        "product_id" uuid PRIMARY KEY NOT NULL,
        "published_revision_id" uuid,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "product_stories_product_fk"
          FOREIGN KEY ("product_id") REFERENCES "${schema}"."products"("id") ON DELETE CASCADE,
        CONSTRAINT "product_stories_published_revision_fk"
          FOREIGN KEY ("published_revision_id")
          REFERENCES "${schema}"."product_story_revisions"("id") ON DELETE SET NULL
      )
    `);
    const fixture = {
      schema,
      productA: randomUUID(),
      productB: randomUUID(),
      productC: randomUUID(),
    };
    await pgSql.unsafe(`INSERT INTO "${schema}"."products" ("id") VALUES ($1), ($2), ($3)`, [
      fixture.productA,
      fixture.productB,
      fixture.productC,
    ]);
    return fixture;
  }

  async function dropFixture(schema: string): Promise<void> {
    assertTestSchema(schema);
    await pgSql.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }

  async function runMigration(schema: string): Promise<void> {
    assertTestSchema(schema);
    await pgSql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      for (const originalStatement of migrationStatements) {
        const statement = originalStatement.replaceAll(
          '"public"."product_story_revisions"',
          `"${schema}"."product_story_revisions"`
        );
        await tx.unsafe(statement);
      }
    });
  }

  async function insertRevision(
    fixture: LegacyFixture,
    values: {
      id?: string;
      productId?: string;
      revisionNumber?: number;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      blocks?: unknown;
      publishedAt?: Date | null;
      actorId?: string | null;
    }
  ): Promise<string> {
    const id = values.id ?? randomUUID();
    await pgSql.unsafe(
      `INSERT INTO "${fixture.schema}"."product_story_revisions" (
        "id", "product_id", "revision_number", "status", "blocks", "published_at",
        "created_by_auth_user_id"
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        id,
        values.productId ?? fixture.productA,
        values.revisionNumber ?? 1,
        values.status ?? "DRAFT",
        pgSql.json((values.blocks ?? []) as postgres.JSONValue),
        values.publishedAt ?? null,
        values.actorId ?? null,
      ]
    );
    return id;
  }

  async function insertStory(
    fixture: LegacyFixture,
    productId: string,
    publishedRevisionId: string | null
  ): Promise<void> {
    await pgSql.unsafe(
      `INSERT INTO "${fixture.schema}"."product_stories"
        ("product_id", "published_revision_id") VALUES ($1, $2)`,
      [productId, publishedRevisionId]
    );
  }

  async function expectPreflightFailure(
    arrange: (fixture: LegacyFixture) => Promise<void>,
    diagnostic: string
  ): Promise<void> {
    const fixture = await createLegacyFixture();
    try {
      await arrange(fixture);
      await expect(runMigration(fixture.schema)).rejects.toThrow(diagnostic);
      const columns = await pgSql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = ${fixture.schema}
          AND table_name = 'product_stories'
          AND column_name = 'draft_revision_id'
      `;
      expect(columns).toHaveLength(0);
    } finally {
      await dropFixture(fixture.schema);
    }
  }

  it("applies cleanly to an empty legacy schema and keeps draft_revision_id nullable", async () => {
    const fixture = await createLegacyFixture();
    try {
      await runMigration(fixture.schema);
      const columns = await pgSql`
        SELECT is_nullable, data_type
        FROM information_schema.columns
        WHERE table_schema = ${fixture.schema}
          AND table_name = 'product_stories'
          AND column_name = 'draft_revision_id'
      `;
      expect(columns).toEqual([{ is_nullable: "YES", data_type: "uuid" }]);

      await pgSql.unsafe(
        `INSERT INTO "${fixture.schema}"."product_stories" ("product_id") VALUES ($1)`,
        [fixture.productA]
      );
      const row = await pgSql.unsafe(
        `SELECT "draft_revision_id" FROM "${fixture.schema}"."product_stories" WHERE "product_id" = $1`,
        [fixture.productA]
      );
      expect(row[0]?.draft_revision_id).toBeNull();
    } finally {
      await dropFixture(fixture.schema);
    }
  });

  it("backfills aggregates and the sole DRAFT pointer while preserving legacy publication data", async () => {
    const fixture = await createLegacyFixture();
    const actorId = randomUUID();
    const draftBlocks = [{ type: "text_section", payload: { body: "Conservado" } }];
    const draftId = await insertRevision(fixture, {
      productId: fixture.productA,
      status: "DRAFT",
      blocks: draftBlocks,
      actorId,
    });
    const publishedAt = new Date("2026-08-01T12:00:00.000Z");
    const publishedId = await insertRevision(fixture, {
      productId: fixture.productB,
      status: "PUBLISHED",
      publishedAt,
      revisionNumber: 4,
    });
    const archivedId = await insertRevision(fixture, {
      productId: fixture.productC,
      status: "ARCHIVED",
      revisionNumber: 8,
    });
    await insertStory(fixture, fixture.productB, publishedId);

    try {
      await runMigration(fixture.schema);
      const stories = await pgSql.unsafe(
        `SELECT "product_id", "draft_revision_id", "published_revision_id"
         FROM "${fixture.schema}"."product_stories" ORDER BY "product_id"`
      );
      expect(stories).toHaveLength(3);
      expect(stories).toContainEqual({
        product_id: fixture.productA,
        draft_revision_id: draftId,
        published_revision_id: null,
      });
      expect(stories).toContainEqual({
        product_id: fixture.productB,
        draft_revision_id: null,
        published_revision_id: publishedId,
      });
      expect(stories).toContainEqual({
        product_id: fixture.productC,
        draft_revision_id: null,
        published_revision_id: null,
      });
      const revisions = await pgSql.unsafe(
        `SELECT "id", "revision_number", "status", "blocks", "published_at",
                "created_by_auth_user_id"
         FROM "${fixture.schema}"."product_story_revisions" ORDER BY "id"`
      );
      expect(revisions).toHaveLength(3);
      expect(revisions).toContainEqual(
        expect.objectContaining({
          id: draftId,
          revision_number: 1,
          status: "DRAFT",
          blocks: draftBlocks,
          published_at: null,
          created_by_auth_user_id: actorId,
        })
      );
      expect(revisions).toContainEqual(
        expect.objectContaining({
          id: publishedId,
          revision_number: 4,
          status: "PUBLISHED",
          published_at: publishedAt,
        })
      );
      expect(revisions.some((revision) => revision.id === archivedId)).toBe(true);
    } finally {
      await dropFixture(fixture.schema);
    }
  });

  it("fails before DDL for a cross-Product published pointer", async () => {
    await expectPreflightFailure(async (fixture) => {
      const revisionId = await insertRevision(fixture, {
        productId: fixture.productB,
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
      await insertStory(fixture, fixture.productA, revisionId);
    }, "GP026_CHK1_PREFLIGHT_CROSS_PRODUCT_PUBLISHED_POINTER");
  });

  it("fails before DDL for a published pointer to a non-PUBLISHED revision", async () => {
    await expectPreflightFailure(async (fixture) => {
      const revisionId = await insertRevision(fixture, { status: "DRAFT" });
      await insertStory(fixture, fixture.productA, revisionId);
    }, "GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_STATUS");
  });

  it("fails before DDL for a published revision without published_at", async () => {
    await expectPreflightFailure(async (fixture) => {
      await pgSql.unsafe(
        `ALTER TABLE "${fixture.schema}"."product_story_revisions"
         DROP CONSTRAINT "product_story_revisions_published_at_check"`
      );
      const revisionId = await insertRevision(fixture, { status: "PUBLISHED" });
      await insertStory(fixture, fixture.productA, revisionId);
    }, "GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_TIMESTAMP");
  });

  it("fails before DDL when a Product has multiple DRAFT revisions", async () => {
    await expectPreflightFailure(async (fixture) => {
      await insertRevision(fixture, { revisionNumber: 1, status: "DRAFT" });
      await insertRevision(fixture, { revisionNumber: 2, status: "DRAFT" });
    }, "GP026_CHK1_PREFLIGHT_MULTIPLE_DRAFTS");
  });

  it("fails before DDL when a Product has multiple PUBLISHED revisions", async () => {
    await expectPreflightFailure(async (fixture) => {
      await insertRevision(fixture, {
        revisionNumber: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
      await insertRevision(fixture, {
        revisionNumber: 2,
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
    }, "GP026_CHK1_PREFLIGHT_MULTIPLE_PUBLISHED");
  });

  it("fails before DDL for a lone PUBLISHED revision without a Story aggregate", async () => {
    await expectPreflightFailure(async (fixture) => {
      await insertRevision(fixture, {
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
    }, "GP026_CHK1_PREFLIGHT_ORPHAN_PUBLISHED_REVISION");
  });

  it("fails before DDL for a lone PUBLISHED revision with a null authoritative pointer", async () => {
    await expectPreflightFailure(async (fixture) => {
      await insertRevision(fixture, {
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
      await insertStory(fixture, fixture.productA, null);
    }, "GP026_CHK1_PREFLIGHT_ORPHAN_PUBLISHED_REVISION");
  });

  it("preserves an exact authoritative PUBLISHED pointer", async () => {
    const fixture = await createLegacyFixture();
    const publishedId = await insertRevision(fixture, {
      status: "PUBLISHED",
      publishedAt: new Date(),
    });
    await insertStory(fixture, fixture.productA, publishedId);
    try {
      await runMigration(fixture.schema);
      const stories = await pgSql.unsafe(
        `SELECT "published_revision_id", "draft_revision_id"
         FROM "${fixture.schema}"."product_stories" WHERE "product_id" = $1`,
        [fixture.productA]
      );
      expect(stories).toEqual([{ published_revision_id: publishedId, draft_revision_id: null }]);
    } finally {
      await dropFixture(fixture.schema);
    }
  });

  it("enforces ownership, distinct pointers, partial uniqueness, and Product cascade", async () => {
    const fixture = await createLegacyFixture();
    try {
      await runMigration(fixture.schema);
      const draftA = await insertRevision(fixture, {
        productId: fixture.productA,
        status: "DRAFT",
      });
      const publishedB = await insertRevision(fixture, {
        productId: fixture.productB,
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
      await pgSql.unsafe(
        `INSERT INTO "${fixture.schema}"."product_stories"
         ("product_id", "draft_revision_id") VALUES ($1, $2)`,
        [fixture.productA, draftA]
      );

      await expect(
        pgSql.unsafe(
          `UPDATE "${fixture.schema}"."product_stories"
           SET "draft_revision_id" = $1 WHERE "product_id" = $2`,
          [publishedB, fixture.productA]
        )
      ).rejects.toThrow(/product_stories_draft_revision_product_fk/);
      await expect(
        pgSql.unsafe(
          `UPDATE "${fixture.schema}"."product_stories"
           SET "published_revision_id" = $1 WHERE "product_id" = $2`,
          [publishedB, fixture.productA]
        )
      ).rejects.toThrow(/product_stories_published_revision_product_fk/);
      await expect(
        pgSql.unsafe(
          `UPDATE "${fixture.schema}"."product_stories"
           SET "published_revision_id" = $1 WHERE "product_id" = $2`,
          [draftA, fixture.productA]
        )
      ).rejects.toThrow(/product_stories_distinct_revision_pointers/);
      await expect(
        insertRevision(fixture, {
          productId: fixture.productA,
          revisionNumber: 2,
          status: "DRAFT",
        })
      ).rejects.toThrow(/product_story_revisions_one_draft_per_product_idx/);

      await insertRevision(fixture, {
        productId: fixture.productC,
        revisionNumber: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      });
      await expect(
        insertRevision(fixture, {
          productId: fixture.productC,
          revisionNumber: 2,
          status: "PUBLISHED",
          publishedAt: new Date(),
        })
      ).rejects.toThrow(/product_story_revisions_one_published_per_product_idx/);

      await pgSql.unsafe(`DELETE FROM "${fixture.schema}"."products" WHERE "id" = $1`, [
        fixture.productA,
      ]);
      const remaining = await pgSql.unsafe(
        `SELECT
          (SELECT COUNT(*)::int FROM "${fixture.schema}"."product_stories" WHERE "product_id" = $1) AS stories,
          (SELECT COUNT(*)::int FROM "${fixture.schema}"."product_story_revisions" WHERE "product_id" = $1) AS revisions`,
        [fixture.productA]
      );
      expect(remaining[0]).toEqual({ stories: 0, revisions: 0 });
    } finally {
      await dropFixture(fixture.schema);
    }
  });

  it("preserves named single-pointer and composite constraints after migration", async () => {
    const fixture = await createLegacyFixture();
    try {
      await runMigration(fixture.schema);
      const constraints = await pgSql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = ${fixture.schema}
          AND table_name IN ('product_stories', 'product_story_revisions')
      `;
      const names = constraints.map((row) => row.constraint_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "product_stories_published_revision_fk",
          "product_stories_draft_revision_fk",
          "product_story_revisions_product_id_id_unique",
          "product_stories_published_revision_product_fk",
          "product_stories_draft_revision_product_fk",
          "product_stories_distinct_revision_pointers",
        ])
      );
    } finally {
      await dropFixture(fixture.schema);
    }
  });
});
