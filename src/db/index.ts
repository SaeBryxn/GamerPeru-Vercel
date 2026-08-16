import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

const connectionString =
  rawUrl || "postgres://postgres:postgres@127.0.0.1:54322/postgres";

// Prevent multiple connection pool instances in development hot-reloading
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const client =
  globalForDb.conn ??
  postgres(connectionString, {
    prepare: false, // Required for Supavisor transaction pooler
    max: isProduction ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (!isProduction) {
  globalForDb.conn = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
