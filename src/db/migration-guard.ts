/**
 * Gamer Perú — Fail-Closed Database Migration Target Guard
 *
 * Prevents accidental execution of migrations against hosted Supabase
 * when local development or local testing is intended.
 *
 * Implements fail-closed environment validation and strict project identity checks.
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
    // In local mode, determine candidate URL
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

    // Local mode must strictly use port 54322
    const port = parsed.port;
    if (port !== "54322") {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Local database migration target must strictly use Supabase local port 54322. Found port '${port || "default"}'. Target: ${sanitizeConnectionUrl(candidateUrl)}`
      );
    }

    // Database name must strictly be 'postgres'
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName !== "postgres") {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Local database migration target must strictly use database 'postgres'. Found '${dbName}'. Target: ${sanitizeConnectionUrl(candidateUrl)}`
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
    const username = decodeURIComponent(parsed.username);
    const expectedProjectRef = AUTHORIZED_HOSTED_PROJECT_REF;
    const directHostname = `db.${expectedProjectRef}.supabase.co`;

    const isDirectHost = hostname === directHostname;
    const isPoolerHost =
      hostname.endsWith(".pooler.supabase.com") &&
      /^[a-z0-9-]+(\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(hostname);

    if (!isDirectHost && !isPoolerHost) {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Hosted migration target host '${hostname}' does not match authorized Gamer Perú Supabase direct endpoint ('${directHostname}') or session pooler ('*.pooler.supabase.com').`
      );
    }

    if (isDirectHost) {
      const isAuthorizedDirectUser =
        username === "postgres" || username === `postgres.${expectedProjectRef}`;
      if (!isAuthorizedDirectUser) {
        throw new Error(
          `MIGRATION_GUARD_VIOLATION: Hosted direct migration username '${username}' does not match authorized direct username 'postgres' or 'postgres.${expectedProjectRef}'.`
        );
      }
    }

    if (isPoolerHost) {
      const isAuthorizedPoolerUser = username === `postgres.${expectedProjectRef}`;
      if (!isAuthorizedPoolerUser) {
        throw new Error(
          `MIGRATION_GUARD_VIOLATION: Hosted pooler migration username '${username}' does not match authorized project user 'postgres.${expectedProjectRef}'.`
        );
      }
    }

    // Hosted migration must strictly use port 5432 (Transaction Pooler port 6543 and arbitrary non-5432 ports are forbidden)
    const port = parsed.port;
    if (port !== "5432") {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Hosted database migration target must strictly use port 5432. Found port '${port || "default"}'. Transaction Pooler port 6543 and arbitrary non-5432 ports are forbidden.`
      );
    }

    // Database name must strictly be 'postgres'
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName !== "postgres") {
      throw new Error(
        `MIGRATION_GUARD_VIOLATION: Hosted database migration target must strictly use database 'postgres'. Found '${dbName}'.`
      );
    }

    return {
      targetUrl: candidateUrl,
      environment: "hosted",
      projectRef: expectedProjectRef,
    };
  }

  throw new Error(
    `MIGRATION_GUARD_VIOLATION: Unknown GAMERPERU_MIGRATION_ENV '${mode}'. Allowed modes are 'local' and 'hosted'.`
  );
}
