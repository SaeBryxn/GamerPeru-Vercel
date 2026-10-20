import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { logger } from "@/lib/logger";
import { resolvePoolMax, usesSupabaseSessionPooler } from "./pool-config";
import * as schema from "./schema";

/**
 * Server-only Database Client & Connection Pool
 *
 * Configured with prepare: false for full compatibility with Supabase Supavisor
 * connection pooler in transaction mode.
 */

const LOCAL_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

function clientOptions(): postgres.Options<Record<string, postgres.PostgresType>> {
  return {
    prepare: false, // Required for Supavisor transaction pooler
    max: resolvePoolMax(process.env.DATABASE_POOL_MAX),
    // Never stack a query onto a busy connection: Supavisor's transaction mode returns only the
    // first reply of a pipelined batch, so the rest waited forever (Vercel 300 s timeouts, admin
    // skeletons). Extra queries now wait for a free connection. Transactions keep working through
    // patches/postgres@3.4.9.patch, which lets sql.begin reserve its connection without pipelining.
    max_pipeline: 0,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supavisor recycles pooled sessions on its own. Without these bounds a
    // socket it already dropped keeps a request waiting forever instead of
    // failing fast and being retried on a fresh connection.
    max_lifetime: 60 * 10,
    connection: { statement_timeout: 15_000 },
  };
}

function createDatabase(client: postgres.Sql) {
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;

/** The Workers runtime reports this user agent; Node (dev, tests, builds) never does. */
const isCloudflareWorker =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

function createNodeDatabase(): Database {
  const isProduction = process.env.NODE_ENV === "production";
  const rawUrl = process.env.DATABASE_URL;

  if (isProduction && !rawUrl) {
    throw new Error("DATABASE_URL must be explicitly configured in production environments.");
  }

  const connectionString = rawUrl ?? LOCAL_DATABASE_URL;

  if (isProduction && usesSupabaseSessionPooler(connectionString)) {
    logger.warn({
      event: "database_session_pooler_in_production",
      hint: "Use the transaction pooler (port 6543) for DATABASE_URL on serverless deployments.",
    });
  }

  // Dev route bundles can coexist. Closing another bundle's pool interrupts its active requests;
  // each module owns its pool and postgres.js retires idle connections after twenty seconds.
  return createDatabase(postgres(connectionString, clientOptions()));
}

/**
 * Workers forbid reusing a socket opened by another request, so a module-level pool would fail
 * from the second request on. Each request gets its own client, keyed by the request's execution
 * context; `db` stays a single import everywhere and resolves to the current request's client.
 * A HYPERDRIVE binding, when configured, replaces DATABASE_URL so connections are pooled by
 * Cloudflare instead of being opened against Supabase on every request.
 */
function createRequestScopedDatabase(): Database {
  const perRequest = new WeakMap<object, Database>();

  const current = (): Database => {
    const { ctx, env } = getCloudflareContext();
    let database = perRequest.get(ctx);
    if (!database) {
      const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
      const connectionString = hyperdrive?.connectionString ?? process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("DATABASE_URL or a HYPERDRIVE binding must be configured on Cloudflare.");
      }
      database = createDatabase(postgres(connectionString, clientOptions()));
      perRequest.set(ctx, database);
    }
    return database;
  };

  return new Proxy({} as Database, {
    get(_target, property) {
      const database = current();
      const value: unknown = Reflect.get(database, property, database);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
}

export const db: Database = isCloudflareWorker
  ? createRequestScopedDatabase()
  : createNodeDatabase();
