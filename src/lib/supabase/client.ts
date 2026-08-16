import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/config/env";

/**
 * Creates a Supabase client for use in browser Client Components.
 * Safe for public bundle inclusion using NEXT_PUBLIC_* variables.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
