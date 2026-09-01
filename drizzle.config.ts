import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolveMigrationTarget } from "./src/db/migration-guard";

// Deterministically load .env.local first (if present), then .env
const envLocal = resolve(process.cwd(), ".env.local");
const envDefault = resolve(process.cwd(), ".env");

if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

// Resolve and strictly guard migration target URL (fail-closed against accidental hosted mutations)
const { targetUrl } = resolveMigrationTarget(process.env);

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
