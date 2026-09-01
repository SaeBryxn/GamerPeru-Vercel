/**
 * Gamer Perú — Fail-Closed Database Migration Target Guard
 *
 * Prevents accidental execution of migrations against hosted Supabase
 * when local development or local testing is intended.
 *
 * Implements fail-closed environment validation and project identity checks.
 */

export interface MigrationGuardEnv {
  GAMERPERU_MIGRATION_ENV?: string;
  AUTHORIZED_HOSTED_DEPLOYMENT?: string;
  DATABASE_MIGRATION_URL?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
}

export const CANONICAL_LOCAL_MIGRATION_URL =
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

export const AUTHORIZED_HOSTED_PROJECT_REF = "jpjffalmvlxpufvtvskx";

export interface ResolvedMigrationConfig {
  targetUrl: string;
  environment: "local" | "hosted";
  projectRef?: string;
}

/**
 * Sanitizes connection URLs for safe logging/error messages (redacts password).
 */
export function sanitizeConnectionUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "REDACTED";
    }
    return parsed.toString();
  } catch {
    return "[INVALID_URL]";
  }
}

/**
 * Resolves and strictly validates the database migration target URL.
 * Throws a typed MIGRATION_GUARD_VIOLATION error if validation fails.
 */
export function resolveMigrationTarget(
  env: MigrationGuardEnv = process.env
): ResolvedMigrationConfig {
  const mode = (env.GAMERPERU_MIGRATION_ENV ?? "local").toLowerCase().trim();

  if (mode === "local") {
    // In local mode, determine the candidate URL
    const candidateUrl =
      env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL ?? CANONICAL_LOCAL_MIGRATION_URL;

    let parsed: URL;
    try {
      parsed = new URL(candidateUrl);
    } catch {
      throw new Error(
        "MIGRATION_GUARD_VIOLATION: Invalid database connection URL specified for local migration."
      );
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

    if (!isLocalHost) {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Attempted to run database migration in 'local' mode against non-local host '${hostname}'. ` +
          `Local mode strictly permits only 127.0.0.1 or localhost. ` +
          `To execute authorized hosted deployment, explicitly set GAMERPERU_MIGRATION_ENV=hosted and AUTHORIZED_HOSTED_DEPLOYMENT=true.`
      );
    }

    return {
      targetUrl: candidateUrl,
      environment: "local",
    };
  }

  if (mode === "hosted") {
    if (env.AUTHORIZED_HOSTED_DEPLOYMENT !== "true") {
      throw new Error(
        "MIGRATION_GUARD_VIOLATION: Hosted database migrations require explicit authorization confirmation via AUTHORIZED_HOSTED_DEPLOYMENT=true."
      );
    }

    const candidateUrl = env.DATABASE_MIGRATION_URL;
    if (!candidateUrl) {
      throw new Error(
        "MIGRATION_GUARD_VIOLATION: DATABASE_MIGRATION_URL must be explicitly configured for hosted database migrations."
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(candidateUrl);
    } catch {
      throw new Error(
        "MIGRATION_GUARD_VIOLATION: Invalid DATABASE_MIGRATION_URL specified for hosted migration."
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Verify project identity in hostname or username
    const matchesProjectRef =
      hostname.includes(AUTHORIZED_HOSTED_PROJECT_REF) ||
      parsed.username.includes(AUTHORIZED_HOSTED_PROJECT_REF);

    if (!matchesProjectRef) {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Hosted migration target host '${hostname}' does not match authorized Gamer Perú Supabase project ref '${AUTHORIZED_HOSTED_PROJECT_REF}'.`
      );
    }

    // Verify Direct Connection port 5432 (Transaction Pooler port 6543 is forbidden)
    if (parsed.port === "6543") {
      throw new Error(
        "MIGRATION_GUARD_VIOLATION: Hosted migration cannot run against Transaction Pooler port 6543. Direct connection or Session Pooler port 5432 is required."
      );
    }

    return {
      targetUrl: candidateUrl,
      environment: "hosted",
      projectRef: AUTHORIZED_HOSTED_PROJECT_REF,
    };
  }

  throw new Error(
    `MIGRATION_GUARD_VIOLATION: Unknown GAMERPERU_MIGRATION_ENV '${mode}'. Allowed modes are 'local' and 'hosted'.`
  );
}
