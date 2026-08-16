import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

// Deterministically load .env.local first (if present), then .env
const envLocal = resolve(process.cwd(), ".env.local");
const envDefault = resolve(process.cwd(), ".env");

if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = process.env.DATABASE_URL;

if (isProduction && !databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle operations in production.");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl || "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  },
  strict: true,
  verbose: true,
});
