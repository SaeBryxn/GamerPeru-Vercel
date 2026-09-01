import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GP-020 — Migration Candidate 0011 Static & Foreign Key Audit", () => {
  const migrationsDir = resolve(process.cwd(), "src/db/migrations");
  const migrationFiles = readdirSync(migrationsDir).filter(
    (f) => f.endsWith(".sql") && !f.startsWith("meta")
  );

  it("verifies the 0011 migration file exists", () => {
    const file0011 = migrationFiles.find((f) => f.startsWith("0011_"));
    expect(file0011).toBeDefined();
  });

  it("verifies 0011 contains canonical refunds and audit_events DDL", () => {
    const file0011 = migrationFiles.find((f) => f.startsWith("0011_"));
    const sql = readFileSync(resolve(migrationsDir, file0011!), "utf-8");

    // Enums
    expect(sql).toContain(
      "CREATE TYPE \"public\".\"audit_actor_type\" AS ENUM('CUSTOMER', 'ADMIN', 'SYSTEM')"
    );

    // Tables
    expect(sql).toContain('CREATE TABLE "refunds"');
    expect(sql).toContain('CREATE TABLE "audit_events"');

    // Checks
    expect(sql).toContain(
      'CONSTRAINT "refunds_amount_cents_positive" CHECK ("refunds"."amount_cents" > 0)'
    );
    expect(sql).toContain(
      'CONSTRAINT "refunds_reason_not_empty" CHECK (length(trim("refunds"."reason")) > 0)'
    );

    // Foreign Keys
    expect(sql).toContain(
      'FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict'
    );
    expect(sql).toContain(
      'FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict'
    );

    // Critical FK: actor_auth_user_id MUST reference auth.users(id) ON DELETE SET NULL
    expect(sql).toContain(
      'FOREIGN KEY ("actor_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null'
    );
    expect(sql).not.toContain(
      'FOREIGN KEY ("actor_auth_user_id") REFERENCES "public"."customer_profiles"'
    );

    // Indexes
    expect(sql).toContain(
      'CREATE INDEX "refunds_payment_created_idx" ON "refunds" USING btree ("payment_id","created_at")'
    );
    expect(sql).toContain(
      'CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id")'
    );
    expect(sql).toContain(
      'CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id","timestamp")'
    );
    expect(sql).toContain(
      'CREATE INDEX "audit_events_action_timestamp_idx" ON "audit_events" USING btree ("action","timestamp")'
    );
  });
});
