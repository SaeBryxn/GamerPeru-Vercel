import "server-only";
import { z } from "zod";

/**
 * Server-only environment schema.
 * Contains database connection strings, storage keys, and master encryption keys.
 * Enforced by Next.js `server-only` to prevent accidental inclusion in client bundles.
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL cannot be empty")
      .default("postgres://postgres:postgres@127.0.0.1:54322/postgres"),
    DATABASE_MIGRATION_URL: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_PUBLIC_MEDIA_BUCKET: z.string().default("gamerperu-public-media"),
    R2_PRIVATE_PROOFS_BUCKET: z.string().default("gamerperu-private-proofs"),
    R2_DB_BACKUPS_BUCKET: z.string().default("gamerperu-db-backups-private"),
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    AI_ENCRYPTION_KEY_V1: z
      .string()
      .length(64, "Must be exactly 64 hexadecimal characters")
      .regex(/^[0-9a-fA-F]+$/, "Must be a valid 64-character hexadecimal string")
      .optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    // Local-only synthetic catalog preview. Never enable in production or CI.
    DEV_CATALOG_PREVIEW: z.enum(["0", "1"]).optional(),
  })
  .refine(
    (data) => {
      // In production, DATABASE_URL must not use default localhost fallback
      if (
        data.NODE_ENV === "production" &&
        data.DATABASE_URL === "postgres://postgres:postgres@127.0.0.1:54322/postgres"
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Explicit production DATABASE_URL is required in production environments.",
      path: ["DATABASE_URL"],
    }
  );

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates arbitrary input against the server environment schema.
 */
export function validateServerEnv(input: Record<string, unknown>): ServerEnv {
  return serverEnvSchema.parse(input);
}

function parseServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_MEDIA_BUCKET: process.env.R2_PUBLIC_MEDIA_BUCKET,
    R2_PRIVATE_PROOFS_BUCKET: process.env.R2_PRIVATE_PROOFS_BUCKET,
    R2_DB_BACKUPS_BUCKET: process.env.R2_DB_BACKUPS_BUCKET,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    AI_ENCRYPTION_KEY_V1: process.env.AI_ENCRYPTION_KEY_V1,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    DEV_CATALOG_PREVIEW: process.env.DEV_CATALOG_PREVIEW,
  });
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    const env = parseServerEnv();
    return env[prop as keyof typeof env];
  },
});
