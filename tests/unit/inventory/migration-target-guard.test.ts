import { describe, expect, it } from "vitest";
import {
  AUTHORIZED_HOSTED_PROJECT_REF,
  CANONICAL_LOCAL_MIGRATION_URL,
  resolveMigrationTarget,
} from "@/db/migration-guard";

describe("GP-022 / CHK3-BR1 — Hardened Database Migration Target Guard Suite", () => {
  // 1. canonical direct hosted target -> ACCEPT
  it("Test 1: accepts canonical direct hosted target (db.jpjffalmvlxpufvtvskx.supabase.co:5432/postgres)", () => {
    const validDirectUrl = `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`;
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "hosted",
      AUTHORIZED_HOSTED_DEPLOYMENT: "true",
      DATABASE_MIGRATION_URL: validDirectUrl,
    });
    expect(config.environment).toBe("hosted");
    expect(config.projectRef).toBe(AUTHORIZED_HOSTED_PROJECT_REF);
    expect(config.targetUrl).toBe(validDirectUrl);
  });

  // 2. canonical Session Pooler target -> ACCEPT
  it("Test 2: accepts canonical Supavisor session pooler target (aws-0-sa-east-1.pooler.supabase.com:5432/postgres with project user)", () => {
    const validPoolerUrl = `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
    const config = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "hosted",
      AUTHORIZED_HOSTED_DEPLOYMENT: "true",
      DATABASE_MIGRATION_URL: validPoolerUrl,
    });
    expect(config.environment).toBe("hosted");
    expect(config.projectRef).toBe(AUTHORIZED_HOSTED_PROJECT_REF);
    expect(config.targetUrl).toBe(validPoolerUrl);
  });

  // 3. wrong project direct hostname -> REJECT
  it("Test 3: rejects direct hosted target pointing to an unauthorized project ref hostname", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL:
          "postgresql://postgres:secretpassword@db.unauthorizedref.supabase.co:5432/postgres",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú Supabase/i);
  });

  // 4. arbitrary external hostname + correct project ref in username -> REJECT
  it("Test 4: rejects arbitrary external hostname even if username contains authorized project ref", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@unrelated.example.com:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú Supabase/i);
  });

  // 5. hostname containing canonical hostname as prefix/suffix trick -> REJECT
  it("Test 5: rejects domain spoofing attempts using canonical hostname as prefix or suffix", () => {
    const spoofingUrls = [
      `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co.evil.example:5432/postgres`,
      `postgresql://postgres:secretpassword@evil.db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@pooler.supabase.com.evil.example:5432/postgres`,
      `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@supabase.com.evil.example:5432/postgres`,
    ];

    for (const url of spoofingUrls) {
      expect(() =>
        resolveMigrationTarget({
          GAMERPERU_MIGRATION_ENV: "hosted",
          AUTHORIZED_HOSTED_DEPLOYMENT: "true",
          DATABASE_MIGRATION_URL: url,
        })
      ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú Supabase/i);
    }
  });

  // 6. fake pooler domain -> REJECT
  it("Test 6: rejects fake pooler domain not ending in .pooler.supabase.com", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres.${AUTHORIZED_HOSTED_PROJECT_REF}:secretpassword@notrealpooler.supabase.net:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized Gamer Perú Supabase/i);
  });

  // 7. pooler hostname correcto pero username de otro project ref -> REJECT
  it("Test 7: rejects valid pooler hostname when username belongs to a different project ref", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL:
          "postgresql://postgres.otherprojectref:secretpassword@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*does not match authorized project user/i);
  });

  // 8. port 6543 -> REJECT
  it("Test 8: rejects hosted target pointing to Transaction Pooler port 6543", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:6543/postgres`,
      })
    ).toThrowError(
      /MIGRATION_GUARD_VIOLATION.*must strictly use port 5432.*Transaction Pooler port 6543/i
    );
  });

  // 9. arbitrary port -> REJECT
  it("Test 9: rejects hosted target pointing to arbitrary non-5432 port (e.g. 5434)", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5434/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use port 5432/i);
  });

  // 10. wrong database -> REJECT
  it("Test 10: rejects hosted target pointing to a non-postgres database name", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        AUTHORIZED_HOSTED_DEPLOYMENT: "true",
        DATABASE_MIGRATION_URL: `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/other_db`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*must strictly use database 'postgres'/i);
  });

  // 11. missing explicit hosted authorization -> REJECT
  it("Test 11: rejects hosted mode if AUTHORIZED_HOSTED_DEPLOYMENT is not explicitly true", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "hosted",
        DATABASE_MIGRATION_URL: `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*AUTHORIZED_HOSTED_DEPLOYMENT=true/i);
  });

  // 12. secrets never appear in errors -> PASS
  it("Test 12: ensures error output completely redacts sensitive passwords/credentials", () => {
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

  // 13. local canonical target remains accepted
  it("Test 13: accepts local canonical target on 127.0.0.1:54322 or localhost:54322 with database postgres", () => {
    const config1 = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(config1.environment).toBe("local");
    expect(config1.targetUrl).toBe("postgres://postgres:postgres@127.0.0.1:54322/postgres");

    const config2 = resolveMigrationTarget({
      GAMERPERU_MIGRATION_ENV: "local",
      DATABASE_MIGRATION_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    expect(config2.environment).toBe("local");
    expect(config2.targetUrl).toBe("postgresql://postgres:postgres@localhost:54322/postgres");
  });

  // 14. hosted target in local mode remains rejected
  it("Test 14: rejects hosted Supabase target when GAMERPERU_MIGRATION_ENV is local", () => {
    expect(() =>
      resolveMigrationTarget({
        GAMERPERU_MIGRATION_ENV: "local",
        DATABASE_MIGRATION_URL: `postgresql://postgres:secretpassword@db.${AUTHORIZED_HOSTED_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrowError(/MIGRATION_GUARD_VIOLATION.*non-local host/i);
  });

  it("resolves default canonical local migration target when env is completely empty", () => {
    const config = resolveMigrationTarget({});
    expect(config.environment).toBe("local");
    expect(config.targetUrl).toBe(CANONICAL_LOCAL_MIGRATION_URL);
  });
});
