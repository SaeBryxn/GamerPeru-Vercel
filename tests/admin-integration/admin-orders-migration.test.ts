import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";

const migration = readFileSync(
  resolve(process.cwd(), "src/db/migrations/0015_nifty_prowler.sql"),
  "utf8"
)
  .split("--> statement-breakpoint")
  .map((part) => part.trim())
  .filter(Boolean);

describe("GP-027 CHK1 migration 0015 physical PostgreSQL", () => {
  const databaseUrl = assertLocalDatabaseTarget(
    process.env.DATABASE_URL ??
      process.env.DATABASE_MIGRATION_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
  let pg: postgres.Sql;

  beforeAll(() => {
    pg = postgres(databaseUrl, { max: 2, prepare: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it("applies on a minimal 0014-shaped predecessor without unrelated drift", async () => {
    const schema = `gp027_migration_${randomUUID().replaceAll("-", "")}`;
    expect(schema).toMatch(/^gp027_migration_[0-9a-f]{32}$/);
    await expect(
      pg.begin(async (tx) => {
        await tx.unsafe(`CREATE SCHEMA "${schema}"`);
        await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
        await tx.unsafe(`CREATE TABLE "${schema}"."orders" (
          id uuid PRIMARY KEY, created_at timestamptz NOT NULL, customer_email varchar(255) NOT NULL
        )`);
        for (const statement of migration) {
          await tx.unsafe(statement.replaceAll('"public"."orders"', `"${schema}"."orders"`));
        }
        const columns = await tx`
          SELECT column_name, data_type, is_nullable FROM information_schema.columns
          WHERE table_schema = ${schema} AND table_name = 'order_notes'
          ORDER BY ordinal_position
        `;
        expect(columns.map((column) => column.column_name)).toEqual([
          "id",
          "order_id",
          "author_auth_user_id",
          "body",
          "created_at",
          "mutation_request_id",
          "intent_fingerprint",
          "actor_binding_digest",
        ]);
        expect(columns.find((column) => column.column_name === "body")?.data_type).toBe("text");
        expect(
          columns.find((column) => column.column_name === "mutation_request_id")?.is_nullable
        ).toBe("NO");
        const constraints = await tx`
          SELECT conname, contype, confdeltype, pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = ${schema} AND t.relname = 'order_notes'
        `;
        expect(
          constraints.find((row) => row.conname === "order_notes_order_id_orders_id_fk")
            ?.confdeltype
        ).toBe("r");
        expect(
          constraints.find((row) => row.conname === "order_notes_author_auth_user_id_fk")
            ?.confdeltype
        ).toBe("n");
        expect(
          constraints.find((row) => row.conname === "order_notes_mutation_request_id_unique")
            ?.contype
        ).toBe("u");
        expect(constraints.map((row) => row.conname)).toContain("order_notes_body_not_blank");
        expect(constraints.map((row) => row.conname)).toContain("order_notes_body_max_length");
        const indexes = await tx`
          SELECT tablename, indexname FROM pg_indexes WHERE schemaname = ${schema}
        `;
        expect(indexes.map((row) => row.indexname)).toEqual(
          expect.arrayContaining([
            "order_notes_order_created_id_idx",
            "orders_created_id_idx",
            "orders_lower_email_created_id_idx",
          ])
        );
        const tables = await tx`
          SELECT tablename FROM pg_tables WHERE schemaname = ${schema} ORDER BY tablename
        `;
        expect(tables.map((row) => row.tablename)).toEqual(["order_notes", "orders"]);
        throw new Error("rollback isolated migration fixture");
      })
    ).rejects.toThrow("rollback isolated migration fixture");
    const residue = await pg`SELECT 1 FROM pg_namespace WHERE nspname = ${schema}`;
    expect(residue).toHaveLength(0);
  });
});
