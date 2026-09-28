import "server-only";
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

const isProduction = process.env.NODE_ENV === "production";
const rawUrl = process.env.DATABASE_URL;

if (isProduction && !rawUrl) {
  throw new Error("DATABASE_URL must be explicitly configured in production environments.");
}

const connectionString = rawUrl ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

if (isProduction && usesSupabaseSessionPooler(connectionString)) {
  logger.warn({
    event: "database_session_pooler_in_production",
    hint: "Use the transaction pooler (port 6543) for DATABASE_URL on serverless deployments.",
  });
}

/*
 * One pool per module instance, cached on globalThis so a single dev compilation
 * never opens several. A hot reload builds a new module instance: the sockets of
 * the disposed one stay open but its handlers are gone, and reusing them leaves
 * every query waiting for a reply that is never processed. So a new instance
 * retires the previous pool instead of adopting it.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
  connOwner: symbol | undefined;
};

const moduleInstanceId = Symbol("db-module-instance");

if (!isProduction && globalForDb.conn && globalForDb.connOwner !== moduleInstanceId) {
  void globalForDb.conn.end({ timeout: 0 }).catch(() => {});
  globalForDb.conn = undefined;
}

const client =
  globalForDb.conn ??
  postgres(connectionString, {
    prepare: false, // Required for Supavisor transaction pooler
    max: resolvePoolMax(process.env.DATABASE_POOL_MAX),
    idle_timeout: 20,
    connect_timeout: 10,
    // Supavisor recycles pooled sessions on its own. Without these bounds a
    // socket it already dropped keeps a request waiting forever instead of
    // failing fast and being retried on a fresh connection.
    max_lifetime: 60 * 10,
    connection: { statement_timeout: 15_000 },
  });

if (!isProduction) {
  globalForDb.conn = client;
  globalForDb.connOwner = moduleInstanceId;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
