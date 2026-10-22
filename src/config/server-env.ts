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
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_PUBLIC_MEDIA_BUCKET: z.string().default("gamerperu-public-media"),
    R2_PRIVATE_PROOFS_BUCKET: z.string().default("gamerperu-private-proofs"),
    R2_PRIVATE_PAYMENT_MEDIA_BUCKET: z.string().default("gamerperu-private-payment-media"),
    R2_DB_BACKUPS_BUCKET: z.string().default("gamerperu-db-backups-private"),
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    SERPER_API_KEY: z.string().optional(),
    AI_RESEARCH_FETCH_USER_AGENT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    // Payment Runtime Configuration
    PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10080)
      .optional(),
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

function readRawServerEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_MEDIA_BUCKET: process.env.R2_PUBLIC_MEDIA_BUCKET,
    R2_PRIVATE_PROOFS_BUCKET: process.env.R2_PRIVATE_PROOFS_BUCKET,
    R2_PRIVATE_PAYMENT_MEDIA_BUCKET: process.env.R2_PRIVATE_PAYMENT_MEDIA_BUCKET,
    R2_DB_BACKUPS_BUCKET: process.env.R2_DB_BACKUPS_BUCKET,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    SERPER_API_KEY: process.env.SERPER_API_KEY,
    AI_RESEARCH_FETCH_USER_AGENT: process.env.AI_RESEARCH_FETCH_USER_AGENT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES:
      process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES,
    DEV_CATALOG_PREVIEW: process.env.DEV_CATALOG_PREVIEW,
  };
}

let cachedRaw: Record<string, string | undefined> | null = null;
let cachedEnv: ServerEnv | null = null;

/**
 * Parses once and reuses the result while the inputs are unchanged. process.env can be populated
 * after module load (Workers bindings) or changed by tests, so the inputs are compared on every
 * read instead of caching for the lifetime of the isolate; the comparison is far cheaper than a
 * schema parse on the Workers CPU budget.
 */
function parseServerEnv(): ServerEnv {
  const raw = readRawServerEnv();
  if (cachedEnv && cachedRaw && Object.keys(raw).every((key) => raw[key] === cachedRaw![key])) {
    return cachedEnv;
  }
  const env = serverEnvSchema.parse(raw);
  cachedRaw = raw;
  cachedEnv = env;
  return env;
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    const env = parseServerEnv();
    return env[prop as keyof typeof env];
  },
});

export interface CatalogMediaRuntimeConfig {
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2PublicMediaBucket: string;
}
export function requireCatalogMediaRuntimeConfig(): CatalogMediaRuntimeConfig {
  const accountId = serverEnv.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const publicMediaBucket = serverEnv.R2_PUBLIC_MEDIA_BUCKET.trim();
  if (!serverEnv.S3_ENDPOINT && (!accountId || accountId.startsWith("placeholder_")))
    throw new Error("R2_ACCOUNT_ID is required when S3_ENDPOINT is not set.");
  if (!accessKeyId || accessKeyId.startsWith("placeholder_"))
    throw new Error("R2_ACCESS_KEY_ID is required for real catalog media storage operations.");
  if (!secretAccessKey || secretAccessKey.startsWith("placeholder_"))
    throw new Error("R2_SECRET_ACCESS_KEY is required for real catalog media storage operations.");
  if (!publicMediaBucket)
    throw new Error(
      "R2_PUBLIC_MEDIA_BUCKET is required for real catalog media storage operations."
    );
  return {
    r2AccountId: accountId,
    r2AccessKeyId: accessKeyId,
    r2SecretAccessKey: secretAccessKey,
    r2PublicMediaBucket: publicMediaBucket,
  };
}
