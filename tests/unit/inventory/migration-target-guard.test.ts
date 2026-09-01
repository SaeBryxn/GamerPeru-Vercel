import { describe, expect, it } from "vitest";
import {
  AUTHORIZED_HOSTED_PROJECT_REF,
  CANONICAL_LOCAL_MIGRATION_URL,
  resolveMigrationTarget,
  sanitizeConnectionUrl,
} from "@/db/migration-guard";

describe("GP-021 — Migration-Target Safety Guard", () => {
  it("resolves default local target when no explicit environment variable is set", () => {
    const config = resolveMigrationTarget({});
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe(CANONICAL_LOCAL_MIGRATION_URL);
  });

  it("resolves explicitly configured local 127.0.0.1 target in local mode", () => {
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });

  it("resolves explicitly configured localhost target in local mode", () => {
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe("postgresql://postgres:postgres@localhost:54322/postgres");
  });

  it("fails closed before connection if local mode receives a hosted Supabase target", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*non-local host/i);
  });

  it("fails closed if hosted mode lacks explicit AUTHORIZED_HOSTED_DEPLOYMENT=true", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*AUTHORIZED_HOSTED_DEPLOYMENT=true/i);
  });

  it("fails closed if hosted target does not match authorized Gamer Perú project ref", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL:
          "postgresql://postgres.wrongprojectref:secretpassword@db.wrongprojectref.supabase.co:5432/postgres",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú/i);
  });

  it("fails closed if hosted target uses Transaction Pooler port 6543", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:6543/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*Transaction Pooler port 6543/i);
  });

  it("resolves valid hosted target when explicit environment and authorization are provided", () => {
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

  it("redacts credentials from connection URLs in sanitizeConnectionUrl", () => {
    const raw = "postgresql://user:super_secret_pw123@db.example.com:5432/postgres";
    const sanitized = sanitizeConnectionUrl(raw);
    expect(sanitized).not.toContain("super_secret_pw123");
    expect(sanitized).toContain("REDACTED");
  });
});
