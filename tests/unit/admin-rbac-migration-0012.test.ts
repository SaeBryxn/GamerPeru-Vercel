import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { CANONICAL_ROLES, CANONICAL_PERMISSIONS } from "@/lib/auth/rbac";

describe("GP-022 — RBAC inventory:manage Data Migration 0012 Contract Tests", () => {
  const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
  const migration0012Path = path.join(migrationsDir, "0012_canonical_inventory_permission.sql");
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const snapshot0011Path = path.join(migrationsDir, "meta/0011_snapshot.json");
  const snapshot0012Path = path.join(migrationsDir, "meta/0012_snapshot.json");

  it("proves 0012_canonical_inventory_permission.sql exists and is registered at idx: 12 in _journal.json", () => {
    expect(fs.existsSync(migration0012Path)).toBe(true);
    expect(fs.existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    expect(journal.entries.length).toBeGreaterThanOrEqual(13);

    const entry0012 = journal.entries[12];
    expect(entry0012.idx).toBe(12);
    expect(entry0012.tag).toBe("0012_canonical_inventory_permission");
    expect(entry0012.breakpoints).toBe(true);
  });

  it("proves 0012 snapshot exists and is schema-equivalent to 0011 snapshot (data-only migration, zero DDL delta)", () => {
    expect(fs.existsSync(snapshot0012Path)).toBe(true);

    const snap0011 = JSON.parse(fs.readFileSync(snapshot0011Path, "utf8"));
    const snap0012 = JSON.parse(fs.readFileSync(snapshot0012Path, "utf8"));

    expect(snap0012.prevId).toBe(snap0011.id);
    expect(snap0012.version).toBe(snap0011.version);
    expect(snap0012.dialect).toBe(snap0011.dialect);
    expect(snap0012.tables).toEqual(snap0011.tables);
    expect(snap0012.enums).toEqual(snap0011.enums);
  });

  it("proves migration 0012 inserts canonical permission inventory:manage with deterministic UUID", () => {
    const sql = fs.readFileSync(migration0012Path, "utf8");

    expect(sql).toContain("'018f0000-0000-7000-8000-00000000002b'");
    expect(sql).toContain("'inventory:manage'");
    expect(sql).toContain('ON CONFLICT ("name") DO NOTHING');
  });

  it("proves migration 0012 maps inventory:manage exclusively to SUPER_ADMIN", () => {
    const sql = fs.readFileSync(migration0012Path, "utf8");

    expect(sql).toContain("r.name = 'SUPER_ADMIN' AND p.name = 'inventory:manage'");
    expect(sql).not.toContain("r.name = 'ADMIN_CATALOG'");
    expect(sql).not.toContain("r.name = 'ADMIN_ORDERS'");
    expect(sql).not.toContain("r.name = 'ADMIN_SUPPORT'");
    expect(sql).not.toContain("r.name = 'CUSTOMER'");
  });

  it("proves CANONICAL_PERMISSIONS in code includes inventory:manage", () => {
    expect(CANONICAL_PERMISSIONS).toContain("inventory:manage");
    expect(CANONICAL_PERMISSIONS.length).toBe(11);
  });

  it("proves CANONICAL_ROLES remains exactly 5 roles", () => {
    expect(CANONICAL_ROLES).toEqual([
      "SUPER_ADMIN",
      "ADMIN_CATALOG",
      "ADMIN_ORDERS",
      "ADMIN_SUPPORT",
      "CUSTOMER",
    ]);
    expect(CANONICAL_ROLES.length).toBe(5);
  });
});
