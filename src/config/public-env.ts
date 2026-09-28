import { z } from "zod";

/**
 * Public client-accessible environment schema.
 * Only variables prefixed with NEXT_PUBLIC_ may be exposed to the browser runtime.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CDN_URL: z.string().url().default("http://localhost:3000/media"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default("sb_publishable_placeholder_key"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  /** Store WhatsApp number in international format, digits only (e.g. 51987654321). */
  NEXT_PUBLIC_WHATSAPP_NUMBER: z
    .string()
    .regex(/^\d{8,15}$/)
    .optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates arbitrary input against the public environment schema.
 */
export function validatePublicEnv(input: Record<string, unknown>): PublicEnv {
  return publicEnvSchema.parse(input);
}

/**
 * Variables whose local defaults point at localhost. A deployment that silently fell back to them
 * would build and serve a site whose links, media and sign-in all target the developer machine.
 */
export const DEPLOYMENT_REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CDN_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

type PublicEnvSource = Partial<Record<keyof PublicEnv, string | undefined>>;

/**
 * Resolves the public environment. Blank values count as not configured: locally they fall back
 * to the defaults, and on a deployment the required ones fail with the names to set.
 */
export function resolvePublicEnv(
  source: PublicEnvSource,
  options: { requireDeploymentValues: boolean }
): PublicEnv {
  const input = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value === undefined || value.trim() === "" ? undefined : value.trim(),
    ])
  ) as PublicEnvSource;

  if (options.requireDeploymentValues) {
    const missing = DEPLOYMENT_REQUIRED_PUBLIC_ENV.filter((key) => input[key] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Missing public environment variables for this deployment: ${missing.join(", ")}. ` +
          "Set them for this environment in the hosting provider and redeploy; NEXT_PUBLIC_* values are inlined at build time."
      );
    }
  }

  return publicEnvSchema.parse(input);
}

function parsePublicEnv(): PublicEnv {
  // Each variable is read by its literal name so Next.js can inline it into client bundles.
  return resolvePublicEnv(
    {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
    },
    // VERCEL is set on Vercel builds and servers, never in the browser bundle, so the check runs
    // where it can stop a bad deployment and local builds (including `next start`) keep defaults.
    { requireDeploymentValues: process.env.VERCEL === "1" }
  );
}

export const publicEnv = parsePublicEnv();
