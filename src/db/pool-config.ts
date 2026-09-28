/**
 * Connections each server instance may hold. On serverless every warm instance keeps its own
 * pool, so the effective total is this value times the number of instances; a small cap keeps
 * Supabase's pooler from filling up under bursts. DATABASE_POOL_MAX overrides it.
 */
export const DEFAULT_POOL_MAX = 3;

export function resolvePoolMax(configured: string | undefined): number {
  const parsed = Number(configured?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

/**
 * Supabase's pooler serves session mode on 5432 and transaction mode on 6543. Session mode keeps
 * one database connection per client for its lifetime (15 on the free tier), which serverless
 * instances exhaust quickly; transaction mode shares connections between queries.
 */
export function usesSupabaseSessionPooler(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return url.hostname.endsWith(".pooler.supabase.com") && (url.port || "5432") === "5432";
  } catch {
    return false;
  }
}
