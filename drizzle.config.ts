import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Deterministically load .env.local first (if present), then .env
const envLocal = resolve(process.cwd(), ".env.local");
const envDefault = resolve(process.cwd(), ".env");

if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.DATABASE_URL;

const LOCAL_DEFAULT = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

let targetUrl: string;

if (migrationUrl) {
  targetUrl = migrationUrl;
} else if ((!isProduction || isTest) && !runtimeUrl) {
  targetUrl = LOCAL_DEFAULT;
} else if (
  (!isProduction || isTest) &&
  runtimeUrl &&
  (runtimeUrl.includes("127.0.0.1") || runtimeUrl.includes("localhost"))
) {
  targetUrl = runtimeUrl;
} else {
  throw new Error(
    "DATABASE_MIGRATION_URL must be explicitly configured for database migrations. " +
      "Direct connection (port 5432) or Session Pooler (port 5432) is required."
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: targetUrl,
  },
  strict: true,
  verbose: true,
});
