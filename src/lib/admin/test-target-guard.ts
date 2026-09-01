/**
 * Gamer Perú — Fail-Closed Local Test Target Guards
 *
 * Enforces that test suites and seeding scripts capable of mutating authentication
 * or database state ONLY execute against local deterministic test instances
 * (127.0.0.1:54322 for PostgreSQL and http://127.0.0.1:54321 for Supabase API).
 *
 * Never leaks passwords or connection credentials in error messages.
 */

export class TestTargetSecurityViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestTargetSecurityViolation";
  }
}

/**
 * Validates that a database URL strictly targets local test PostgreSQL (127.0.0.1:54322/postgres).
 * Throws TestTargetSecurityViolation without exposing credentials if invalid.
 */
export function assertLocalDatabaseTarget(rawUrl: string | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new TestTargetSecurityViolation(
      "SECURITY VIOLATION: Database URL must be provided and target 127.0.0.1:54322/postgres."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TestTargetSecurityViolation(
      "SECURITY VIOLATION: Database URL is malformed and cannot be verified as local."
    );
  }

  const isPostgresProtocol = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  const isLocalHost = parsed.hostname === "127.0.0.1";
  const isLocalPort = parsed.port === "54322";
  const isPostgresDb = parsed.pathname === "/postgres";

  if (!isPostgresProtocol || !isLocalHost || !isLocalPort || !isPostgresDb) {
    throw new TestTargetSecurityViolation(
      `SECURITY VIOLATION: Database target must strictly point to 127.0.0.1:54322/postgres. Refusing to mutate target (${parsed.protocol}//${parsed.hostname}:${parsed.port || "default"}${parsed.pathname}).`
    );
  }

  return rawUrl.trim();
}

/**
 * Validates that a Supabase API URL strictly targets local Supabase (http://127.0.0.1:54321).
 * Throws TestTargetSecurityViolation without exposing credentials if invalid.
 */
export function assertLocalSupabaseApiTarget(rawUrl: string | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new TestTargetSecurityViolation(
      "SECURITY VIOLATION: Supabase API URL must be provided and target http://127.0.0.1:54321."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TestTargetSecurityViolation(
      "SECURITY VIOLATION: Supabase API URL is malformed and cannot be verified as local."
    );
  }

  const isHttpProtocol = parsed.protocol === "http:";
  const isLocalHost = parsed.hostname === "127.0.0.1";
  const isLocalPort = parsed.port === "54321";

  if (!isHttpProtocol || !isLocalHost || !isLocalPort) {
    throw new TestTargetSecurityViolation(
      `SECURITY VIOLATION: Supabase API target must strictly point to http://127.0.0.1:54321. Refusing to interact with target (${parsed.protocol}//${parsed.hostname}:${parsed.port || "default"}).`
    );
  }

  return rawUrl.trim();
}
