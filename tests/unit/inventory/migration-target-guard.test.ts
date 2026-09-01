import { describe, expect, it } from "vitest";
import {
  AUTHORIZED_HOSTED_PROJECT_REF,
  CANONICAL_LOCAL_MIGRATION_URL,
  resolveMigrationTarget,
} from "@/db/migration-guard";

describe("GP-021 / CHK2-BR1 — Migration-Target Safety Guard (12 Deterministic Target Tests)", () => {
  // Test 1: local 127.0.0.1:54322 allowed
  it("Test 1: allows local target on 127.0.0.1:54322 with database postgres", () => {
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe("postgres://postgres:postgres@127.0.0.1:54322/postgres");
  });

  // Test 2: local localhost:54322 allowed
  it("Test 2: allows local target on localhost:54322 with database postgres", () => {
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe("postgresql://postgres:postgres@localhost:54322/postgres");
  });

  // Test 3: local 127.0.0.1:5432 rejected
  it("Test 3: rejects local target on 127.0.0.1:5432 (must strictly use 54322)", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use Supabase local port 54322/i);
  });

  // Test 4: local localhost arbitrary port rejected
  it("Test 4: rejects local target on localhost with arbitrary port (e.g. 5433)", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@localhost:5433/postgres",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use Supabase local port 54322/i);
  });

  // Test 5: local hosted hostname rejected
  it("Test 5: rejects hosted Supabase target when in local mode", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*non-local host/i);
  });

  // Test 6: hosted without authorization rejected
  it("Test 6: rejects hosted mode if AUTHORIZED_HOSTED_DEPLOYMENT is not true", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*AUTHORIZED_HOSTED_DEPLOYMENT=true/i);
  });

  // Test 7: hosted wrong project rejected
  it("Test 7: rejects hosted target pointing to unauthorized project ref", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL:
          "postgresql://postgres.unauthorizedref:secretpassword@db.unauthorizedref.supabase.co:5432/postgres",
      })
    ).toThrowError(
      /MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú Supabase project ref/i
    );
  });

  // Test 8: hosted correct project port 5432 allowed
  it("Test 8: allows authorized hosted target on port 5432 with database postgres", () => {
    const validUrl = `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`;
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "hosted",
      AUTHORIZED_HOSTED_DEPLOYMENT: "true",
      DATABASE_MIGRATION_URL: validUrl,
    });
    expect(config.environment).toBe("hosted");
    expect(config.projectRef).toBe(AUTHORIZED_HOSTED_PROJECT_REF);
    expect(config.targetUrl).toBe(validUrl);
  });

  // Test 9: hosted port 6543 rejected
  it("Test 9: rejects hosted target pointing to Transaction Pooler port 6543", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:6543/postgres`,
      })
    ).toThrowError(
      /MIGRATION_GUARD_VIOLATION.*must strictly use port 5432.*Transaction Pooler port 6543/i
    );
  });

  // Test 10: hosted arbitrary non-5432 port rejected
  it("Test 10: rejects hosted target pointing to arbitrary non-5432 port (e.g. 5434)", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5434/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use port 5432/i);
  });

  // Test 11: wrong database name rejected
  it("Test 11: rejects local target with non-postgres database name", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@127.0.0.1:54322/custom_db",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use database 'postgres'/i);
  });

  // Test 12: error output contains no password/credential
  it("Test 12: ensures error output redacts sensitive passwords/credentials", () => {
    const sensitivePw = "SUPER_SECRET_COMPROMISING_PASSWORD_9988!";
    try {
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: `postgresql://postgres:${sensitivePw}@127.0.0.1:5432/wrong_port_db`,
      });
      expect.unreachable("Should have thrown MIGRATION_GUARD_VIOLATION");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      expect(errMsg).not.toContain(sensitivePw);
      expect(errMsg).toContain("REDACTED");
    }
  });

  it("resolves default canonical local migration target when env is completely empty", () => {
    const config = resolveMigrationTarget({});
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe(CANONICAL_LOCAL_MIGRATION_URL);
  });
});
