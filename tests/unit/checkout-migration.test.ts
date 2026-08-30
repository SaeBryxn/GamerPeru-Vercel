import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GP-018 CHK2 — Migration Candidate 0009 Static Audit", () => {
  const migrationsDir = resolve(process.cwd(), "src/db/migrations");
  const migrationFiles = readdirSync(migrationsDir).filter(
    (f) => f.endsWith(".sql") && !f.startsWith("meta")
  );

  it("verifies exact migration count is now 10 (0000 to 0009) and no 0010 exists", () => {
    expect(migrationFiles).toHaveLength(10);
    const ordinals = migrationFiles.map((f) => f.slice(0, 4));
    expect(ordinals).toContain("0000");
    expect(ordinals).toContain("0001");
    expect(ordinals).toContain("0002");
    expect(ordinals).toContain("0003");
    expect(ordinals).toContain("0004");
    expect(ordinals).toContain("0005");
    expect(ordinals).toContain("0006");
    expect(ordinals).toContain("0007");
    expect(ordinals).toContain("0008");
    expect(ordinals).toContain("0009");
    expect(ordinals).not.toContain("0010");
  });

  it("verifies the 0009 migration candidate file exists and contains expected DDL statements", () => {
    const file0009 = migrationFiles.find((f) => f.startsWith("0009_"));
    expect(file0009).toBeDefined();

    const sql = readFileSync(resolve(migrationsDir, file0009!), "utf-8");

    // Enums
    expect(sql).toContain('CREATE TYPE "public"."order_status"');
    expect(sql).toContain('CREATE TYPE "public"."shipment_status"');
    expect(sql).toContain('CREATE TYPE "public"."payment_method_type"');
    expect(sql).toContain('CREATE TYPE "public"."payment_status"');
    expect(sql).toContain('CREATE TYPE "public"."idempotency_operation_type"');
    expect(sql).toContain('CREATE TYPE "public"."inventory_movement_type"');
    expect(sql).toContain('CREATE TYPE "public"."inventory_reference_type"');
    expect(sql).toContain('CREATE TYPE "public"."inventory_reservation_status"');
    expect(sql).toContain('CREATE TYPE "public"."outbox_event_status"');

    // 15 Approved Tables
    expect(sql).toContain('CREATE TABLE "orders"');
    expect(sql).toContain('CREATE TABLE "order_items"');
    expect(sql).toContain('CREATE TABLE "order_address_snapshots"');
    expect(sql).toContain('CREATE TABLE "order_pricing_snapshots"');
    expect(sql).toContain('CREATE TABLE "shipping_methods"');
    expect(sql).toContain('CREATE TABLE "shipments"');
    expect(sql).toContain('CREATE TABLE "payment_method_configurations"');
    expect(sql).toContain('CREATE TABLE "payment_instruction_versions"');
    expect(sql).toContain('CREATE TABLE "payments"');
    expect(sql).toContain('CREATE TABLE "idempotency_keys"');
    expect(sql).toContain('CREATE TABLE "inventory_locations"');
    expect(sql).toContain('CREATE TABLE "inventory_items"');
    expect(sql).toContain('CREATE TABLE "inventory_reservations"');
    expect(sql).toContain('CREATE TABLE "inventory_ledger_entries"');
    expect(sql).toContain('CREATE TABLE "outbox_events"');

    // Check Constraints
    expect(sql).toContain('"orders_pricing_arithmetic_check"');
    expect(sql).toContain('"order_items_quantity_positive"');
    expect(sql).toContain('"order_pricing_snapshots_arithmetic_check"');
    expect(sql).toContain('"payments_refunded_amount_lte_total"');
    expect(sql).toContain('"inventory_items_quantity_on_hand_non_negative"');
    expect(sql).toContain('"inventory_reservations_quantity_positive"');

    // Partial Unique Index
    expect(sql).toContain('"inventory_reservations_order_item_non_terminal_unique"');
    expect(sql).toContain(
      "WHERE \"inventory_reservations\".\"status\" IN ('ACTIVE', 'VERIFICATION_HOLD', 'ALLOCATED')"
    );
  });

  it("verifies zero fake production INSERT statements exist in 0009 migration", () => {
    const file0009 = migrationFiles.find((f) => f.startsWith("0009_"));
    const sql = readFileSync(resolve(migrationsDir, file0009!), "utf-8");

    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });

  it("verifies zero Data API GRANT statements to anon or authenticated exist in 0009 migration", () => {
    const file0009 = migrationFiles.find((f) => f.startsWith("0009_"));
    const sql = readFileSync(resolve(migrationsDir, file0009!), "utf-8");

    expect(sql).not.toMatch(/GRANT\s+.*\s+TO\s+anon/i);
    expect(sql).not.toMatch(/GRANT\s+.*\s+TO\s+authenticated/i);
  });

  it("verifies zero deferred entities (promotions, payment_submissions, payment_verifications, audit_events) in 0009", () => {
    const file0009 = migrationFiles.find((f) => f.startsWith("0009_"));
    const sql = readFileSync(resolve(migrationsDir, file0009!), "utf-8");

    expect(sql).not.toContain('CREATE TABLE "promotions"');
    expect(sql).not.toContain('CREATE TABLE "coupons"');
    expect(sql).not.toContain('CREATE TABLE "coupon_redemptions"');
    expect(sql).not.toContain('CREATE TABLE "order_promotion_snapshots"');
    expect(sql).not.toContain('CREATE TABLE "payment_submissions"');
    expect(sql).not.toContain('CREATE TABLE "payment_verifications"');
    expect(sql).not.toContain('CREATE TABLE "domain_events"');
    expect(sql).not.toContain('CREATE TABLE "audit_events"');
  });
});
