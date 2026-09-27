import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GP-027 CHK1 migration 0015 static contract", () => {
  const directory = resolve(process.cwd(), "src/db/migrations");
  const files = readdirSync(directory).filter((name) => /^0015_.*\.sql$/.test(name));

  it("has exactly one migration at 0015, journaled right after 0014", () => {
    expect(files).toHaveLength(1);
    const journal = JSON.parse(readFileSync(resolve(directory, "meta/_journal.json"), "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    const position = journal.entries.findIndex((entry) => entry.idx === 15);
    expect(journal.entries[position - 1]?.tag).toMatch(/^0014_/);
    expect(journal.entries[position]).toMatchObject({
      idx: 15,
      tag: files[0]?.replace(/\.sql$/, ""),
    });
  });

  it("creates only notes and measured Orders indexes", () => {
    const migration = readFileSync(resolve(directory, files[0]!), "utf8");
    expect(migration).toContain('CREATE TABLE "order_notes"');
    expect(migration).toContain('"mutation_request_id" uuid NOT NULL');
    expect(migration).toContain('"intent_fingerprint" char(64) NOT NULL');
    expect(migration).toContain('"actor_binding_digest" char(64) NOT NULL');
    expect(migration).toContain('CONSTRAINT "order_notes_body_not_blank"');
    expect(migration).toContain('CONSTRAINT "order_notes_body_max_length"');
    expect(migration).toContain('CONSTRAINT "order_notes_mutation_request_id_unique"');
    expect(migration).toContain('REFERENCES "public"."orders"("id") ON DELETE restrict');
    expect(migration).toContain('REFERENCES "auth"."users"("id") ON DELETE set null');
    expect(migration).toContain('CREATE INDEX "order_notes_order_created_id_idx"');
    expect(migration).toContain('CREATE INDEX "orders_created_id_idx"');
    expect(migration).toContain('CREATE INDEX "orders_lower_email_created_id_idx"');
    expect(migration).not.toContain("varchar_pattern_ops");
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(3);
  });
});
