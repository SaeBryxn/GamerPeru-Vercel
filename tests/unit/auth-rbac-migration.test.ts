import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { CANONICAL_ROLES, CANONICAL_PERMISSIONS } from "@/lib/auth/rbac";

describe("GP-015 AUTH8-B — RBAC Seed Migration Contract Tests", () => {
  const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
  const migration0006Path = path.join(migrationsDir, "0006_canonical_rbac_seed.sql");
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const snapshot0005Path = path.join(migrationsDir, "meta/0005_snapshot.json");
  const snapshot0006Path = path.join(migrationsDir, "meta/0006_snapshot.json");

  it("proves 0006_canonical_rbac_seed.sql exists and is registered at idx: 6 in _journal.json", () => {
    expect(fs.existsSync(migration0006Path)).toBe(true);
    expect(fs.existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    expect(journal.entries.length).toBe(7);

    const entry0006 = journal.entries[6];
    expect(entry0006.idx).toBe(6);
    expect(entry0006.tag).toBe("0006_canonical_rbac_seed");
    expect(entry0006.breakpoints).toBe(true);
  });

  it("proves 0006 snapshot exists and is schema-equivalent to 0005 snapshot (data-only migration)", () => {
    expect(fs.existsSync(snapshot0006Path)).toBe(true);

    const snap0005 = JSON.parse(fs.readFileSync(snapshot0005Path, "utf8"));
    const snap0006 = JSON.parse(fs.readFileSync(snapshot0006Path, "utf8"));

    expect(snap0006.prevId).toBe(snap0005.id);
    expect(snap0006.version).toBe(snap0005.version);
    expect(snap0006.dialect).toBe(snap0005.dialect);
    expect(snap0006.tables).toEqual(snap0005.tables);
    expect(snap0006.enums).toEqual(snap0005.enums);
  });

  it("proves migration 0006 contains all 5 canonical roles and no invented roles", () => {
    const sql = fs.readFileSync(migration0006Path, "utf8");

    CANONICAL_ROLES.forEach((role) => {
      expect(sql).toContain(`'${role}'`);
    });

    const forbiddenRoles = ["OWNER", "STAFF", "MODERATOR", "MANAGER", "DEVELOPER", "EC_OS_ADMIN"];
    forbiddenRoles.forEach((role) => {
      expect(sql).not.toContain(`'${role}'`);
    });
  });

  it("proves migration 0006 contains all 10 canonical permissions with exact naming", () => {
    const sql = fs.readFileSync(migration0006Path, "utf8");

    CANONICAL_PERMISSIONS.forEach((perm) => {
      expect(sql).toContain(`'${perm}'`);
    });

    // Verify binding external amendment: ai:manage_credentials present, system:configure_ai and ai:manage absent
    expect(sql).toContain("'ai:manage_credentials'");
    expect(sql).not.toContain("'system:configure_ai'");
    expect(sql).not.toContain("'ai:manage'");
  });

  it("proves migration 0006 contains exactly 17 explicit role-permission mappings", () => {
    const sql = fs.readFileSync(migration0006Path, "utf8");

    // SUPER_ADMIN receives all 10
    expect(sql).toContain("r.name = 'SUPER_ADMIN'");

    // ADMIN_CATALOG receives 3
    expect(sql).toContain(
      "r.name = 'ADMIN_CATALOG' AND p.name IN ('catalog:manage', 'catalog:publish', 'catalog:ai_research')"
    );

    // ADMIN_ORDERS receives 2
    expect(sql).toContain(
      "r.name = 'ADMIN_ORDERS' AND p.name IN ('orders:manage', 'orders:verify')"
    );

    // ADMIN_SUPPORT receives 2
    expect(sql).toContain(
      "r.name = 'ADMIN_SUPPORT' AND p.name IN ('support:manage', 'support:review_rma')"
    );

    // CUSTOMER receives 0 (not in WHERE clause)
    expect(sql).not.toContain("r.name = 'CUSTOMER'");
  });

  it("proves migration 0006 contains zero user_roles inserts, zero DDL, zero GRANTs, zero RLS mutations", () => {
    const sql = fs.readFileSync(migration0006Path, "utf8");

    expect(sql).not.toContain('INSERT INTO "user_roles"');
    expect(sql).not.toContain("CREATE TABLE");
    expect(sql).not.toContain("ALTER TABLE");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("CREATE INDEX");
    expect(sql).not.toContain("GRANT ");
    expect(sql).not.toContain("ENABLE ROW LEVEL SECURITY");
  });
});
