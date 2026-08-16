import { z } from "zod";

/**
 * Public client-accessible environment schema.
 * Only variables prefixed with NEXT_PUBLIC_ may be exposed to the browser.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CDN_URL: z.string().url().default("http://localhost:3000/media"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .default("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_anon_key"),
});

/**
 * Server-only environment schema.
 * Contains database connection strings, API secrets, and master encryption keys.
 * Must NEVER be exposed to or imported within Client Components.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@127.0.0.1:54322/postgres"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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
    .length(64)
    .regex(/^[0-9a-fA-F]+$/, "Must be a 64-character hexadecimal string")
    .optional(),
});

function parsePublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

function parseServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("Attempted to access server environment variables from the client runtime.");
  }
  return serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
  });
}

export const publicEnv = parsePublicEnv();

export const serverEnv = new Proxy({} as z.infer<typeof serverEnvSchema>, {
  get(_target, prop: string) {
    const env = parseServerEnv();
    return env[prop as keyof typeof env];
  },
});
