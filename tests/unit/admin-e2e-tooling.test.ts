import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  assertLocalDatabaseTarget,
  assertLocalSupabaseApiTarget,
  TestTargetSecurityViolation,
} from "@/lib/admin/test-target-guard";

describe("GP-022 POST-CLOSURE — Admin E2E Tooling & Fixture Hardening Suite", () => {
  const seedScriptPath = path.resolve(process.cwd(), "scripts/test/seed-admin-e2e.mjs");
  const cleanupScriptPath = path.resolve(process.cwd(), "scripts/test/cleanup-admin-e2e.mjs");

  const seedScriptContent = fs.readFileSync(seedScriptPath, "utf8");
  const cleanupScriptContent = fs.readFileSync(cleanupScriptPath, "utf8");

  // Test 1: seed rejects missing DATABASE_URL
  it("Test 1: seed target guard rejects missing or empty DATABASE_URL", () => {
    expect(() => assertLocalDatabaseTarget(undefined)).toThrow(TestTargetSecurityViolation);
    expect(() => assertLocalDatabaseTarget("")).toThrow(TestTargetSecurityViolation);
  });

  // Test 2: seed rejects non-local PostgreSQL
  it("Test 2: seed target guard rejects non-local/hosted PostgreSQL targets", () => {
    const hostedDb = "postgres://postgres:secret@db.jpjffalmvlxpufvtvskx.supabase.co:5432/postgres";
    expect(() => assertLocalDatabaseTarget(hostedDb)).toThrow(TestTargetSecurityViolation);
  });

  // Test 3: seed rejects non-local Supabase API
  it("Test 3: seed target guard rejects non-local/hosted Supabase API targets", () => {
    const hostedApi = "https://jpjffalmvlxpufvtvskx.supabase.co";
    expect(() => assertLocalSupabaseApiTarget(hostedApi)).toThrow(TestTargetSecurityViolation);
  });

  // Test 4: seed rejects missing Admin API credential
  it("Test 4: seed script requires SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY and has zero fallback", () => {
    expect(seedScriptContent).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(seedScriptContent).toContain("SUPABASE_SECRET_KEY");
    expect(seedScriptContent).toContain("Direct SQL Auth fallback is forbidden");
  });

  // Test 5: no direct SQL write to auth.users exists in seed
  it("Test 5: asserts zero direct INSERT/UPDATE/DELETE queries against auth.users in seed script", () => {
    expect(seedScriptContent).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
    expect(seedScriptContent).not.toMatch(/UPDATE\s+auth\.users/i);
    expect(seedScriptContent).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
  });

  // Test 6: no direct SQL write to auth.identities exists in seed
  it("Test 6: asserts zero direct INSERT/UPDATE/DELETE queries against auth.identities in seed script", () => {
    expect(seedScriptContent).not.toMatch(/INSERT\s+INTO\s+auth\.identities/i);
    expect(seedScriptContent).not.toMatch(/UPDATE\s+auth\.identities/i);
    expect(seedScriptContent).not.toMatch(/DELETE\s+FROM\s+auth\.identities/i);
  });

  // Test 7: Admin API create failure causes non-zero failure / error throw
  it("Test 7: asserts Admin API createUser errors are explicitly thrown rather than logged as warnings", () => {
    expect(seedScriptContent).not.toContain("console.warn(");
    expect(seedScriptContent).toMatch(/if\s*\(\s*createError/);
    expect(seedScriptContent).toContain("Failed creating user");
  });

  // Test 8: script cannot print success after a failed Auth create
  it("Test 8: confirms success log is located strictly after all Auth creates, DB transactions, and verifications", () => {
    const successLogIndex = seedScriptContent.indexOf(
      "[Admin E2E Seed] Successfully seeded Admin test users and role mappings."
    );
    const createUserIndex = seedScriptContent.indexOf("supabaseAdmin.auth.admin.createUser");
    const signInIndex = seedScriptContent.indexOf("signInWithPassword");

    expect(successLogIndex).toBeGreaterThan(createUserIndex);
    expect(successLogIndex).toBeGreaterThan(signInIndex);
  });

  // Test 9: expected delete-not-found condition is handled safely
  it("Test 9: verifies pre-delete handles 404 / user not found benign conditions without aborting", () => {
    expect(seedScriptContent).toContain("user not found");
    expect(seedScriptContent).toContain("delError.status !== 404");
  });

  // Test 10: cleanup rejects hosted target
  it("Test 10: cleanup script enforces strict local target assertions on DATABASE_URL and Supabase API", () => {
    expect(cleanupScriptContent).toContain("assertLocalDatabaseTarget");
    expect(cleanupScriptContent).toContain("assertLocalSupabaseApiTarget");
  });

  // Test 11: cleanup does not directly mutate auth.users/auth.identities in normal operation
  it("Test 11: confirms cleanup script deletes Auth users via Admin Auth API and not raw SQL", () => {
    expect(cleanupScriptContent).toContain("supabaseAdmin.auth.admin.deleteUser");
    expect(cleanupScriptContent).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
    expect(cleanupScriptContent).not.toMatch(/DELETE\s+FROM\s+auth\.identities/i);
  });

  // Test 12: cleanup is idempotent
  it("Test 12: confirms cleanup handles not-found errors safely for idempotent repeated runs", () => {
    expect(cleanupScriptContent).toContain("user not found");
    expect(cleanupScriptContent).toContain("error.status !== 404");
  });

  // Test 13: local deterministic users fixture definition matches canonical specifications
  it("Test 13: validates canonical deterministic fixture users dictionary in seed script", () => {
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae01");
    expect(seedScriptContent).toContain("superadmin.e2e@gamerperu.pe");
    expect(seedScriptContent).toContain("SUPER_ADMIN");
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae02");
    expect(seedScriptContent).toContain("catalog.e2e@gamerperu.pe");
    expect(seedScriptContent).toContain("ADMIN_CATALOG");
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae03");
    expect(seedScriptContent).toContain("orders.e2e@gamerperu.pe");
    expect(seedScriptContent).toContain("ADMIN_ORDERS");
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae04");
    expect(seedScriptContent).toContain("support.e2e@gamerperu.pe");
    expect(seedScriptContent).toContain("ADMIN_SUPPORT");
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae05");
    expect(seedScriptContent).toContain("customer.e2e@gamerperu.pe");
    expect(seedScriptContent).toContain("CUSTOMER");
    expect(seedScriptContent).toContain("018f0000-0000-7000-8000-00000000ae06");
    expect(seedScriptContent).toContain("norole.e2e@gamerperu.pe");
  });

  // Test 14: seed performs real signInWithPassword check
  it("Test 14: confirms seed script performs real password authentication check before declaring success", () => {
    expect(seedScriptContent).toContain("signInWithPassword");
    expect(seedScriptContent).toContain("ADMIN_E2E_USERS.superadmin.email");
    expect(seedScriptContent).toContain("ADMIN_E2E_PASSWORD");
  });

  // Test 15: seed validates physical role mappings in PostgreSQL
  it("Test 15: confirms seed script queries user_roles to assert exact role mappings and norole isolation", () => {
    expect(seedScriptContent).toContain("SELECT r.name AS role_name");
    expect(seedScriptContent).toContain("FROM user_roles ur");
    expect(seedScriptContent).toContain("Expected 0 role mappings for");
  });

  // Test 16: cleanup user IDs array matches all deterministic users
  it("Test 16: confirms cleanup script targets all 6 deterministic user IDs", () => {
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae01");
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae02");
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae03");
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae04");
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae05");
    expect(cleanupScriptContent).toContain("018f0000-0000-7000-8000-00000000ae06");
  });
});
