import { z } from "zod";

/**
 * Public client-accessible environment schema.
 * Only variables prefixed with NEXT_PUBLIC_ may be exposed to the browser runtime.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CDN_URL: z.string().url().default("http://localhost:3000/media"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .default("sb_publishable_placeholder_key"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates arbitrary input against the public environment schema.
 */
export function validatePublicEnv(input: Record<string, unknown>): PublicEnv {
  return publicEnvSchema.parse(input);
}

function parsePublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export const publicEnv = parsePublicEnv();
