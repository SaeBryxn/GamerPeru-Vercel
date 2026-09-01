import { describe, it, expect } from "vitest";
import {
  assertLocalDatabaseTarget,
  assertLocalSupabaseApiTarget,
  TestTargetSecurityViolation,
} from "@/lib/admin/test-target-guard";

describe("GP-022 / BR1 — Fail-Closed Local Test Target Guard Tests", () => {
  describe("assertLocalDatabaseTarget", () => {
    it("accepts valid local PostgreSQL target with credentials", () => {
      const valid = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
      expect(assertLocalDatabaseTarget(valid)).toBe(valid);
    });

    it("accepts valid local postgresql protocol target", () => {
      const valid = "postgresql://postgres:mysecretpass@127.0.0.1:54322/postgres";
      expect(assertLocalDatabaseTarget(valid)).toBe(valid);
    });

    it("rejects undefined or empty database URL", () => {
      expect(() => assertLocalDatabaseTarget(undefined)).toThrow(TestTargetSecurityViolation);
      expect(() => assertLocalDatabaseTarget("")).toThrow(TestTargetSecurityViolation);
      expect(() => assertLocalDatabaseTarget("   ")).toThrow(TestTargetSecurityViolation);
    });

    it("rejects hosted Supabase database target and never leaks password", () => {
      const hosted =
        "postgres://postgres:ultra_super_secret_password_999@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
      let thrownError: Error | null = null;
      try {
        assertLocalDatabaseTarget(hosted);
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeInstanceOf(TestTargetSecurityViolation);
      expect(thrownError?.message).toContain("SECURITY VIOLATION");
      expect(thrownError?.message).not.toContain("ultra_super_secret_password_999");
    });

    it("rejects localhost instead of explicit 127.0.0.1 IP", () => {
      expect(() =>
        assertLocalDatabaseTarget("postgres://postgres:pass@localhost:54322/postgres")
      ).toThrow(TestTargetSecurityViolation);
    });

    it("rejects non-test port (e.g. 5432, 6543)", () => {
      expect(() =>
        assertLocalDatabaseTarget("postgres://postgres:pass@127.0.0.1:5432/postgres")
      ).toThrow(TestTargetSecurityViolation);
    });

    it("rejects non-postgres database name", () => {
      expect(() =>
        assertLocalDatabaseTarget("postgres://postgres:pass@127.0.0.1:54322/production_db")
      ).toThrow(TestTargetSecurityViolation);
    });
  });

  describe("assertLocalSupabaseApiTarget", () => {
    it("accepts valid local Supabase API URL", () => {
      const valid = "http://127.0.0.1:54321";
      expect(assertLocalSupabaseApiTarget(valid)).toBe(valid);
    });

    it("rejects undefined or empty URL", () => {
      expect(() => assertLocalSupabaseApiTarget(undefined)).toThrow(TestTargetSecurityViolation);
      expect(() => assertLocalSupabaseApiTarget("")).toThrow(TestTargetSecurityViolation);
    });

    it("rejects hosted Supabase URL", () => {
      expect(() =>
        assertLocalSupabaseApiTarget("https://jpjffalmvlxpufvtvskx.supabase.co")
      ).toThrow(TestTargetSecurityViolation);
    });

    it("rejects https scheme for local API", () => {
      expect(() => assertLocalSupabaseApiTarget("https://127.0.0.1:54321")).toThrow(
        TestTargetSecurityViolation
      );
    });

    it("rejects wrong port", () => {
      expect(() => assertLocalSupabaseApiTarget("http://127.0.0.1:8000")).toThrow(
        TestTargetSecurityViolation
      );
    });

    it("rejects localhost instead of 127.0.0.1", () => {
      expect(() => assertLocalSupabaseApiTarget("http://localhost:54321")).toThrow(
        TestTargetSecurityViolation
      );
    });
  });
});
