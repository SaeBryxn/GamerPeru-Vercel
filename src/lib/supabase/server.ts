import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/config/public-env";

/**
 * Creates a request-scoped Supabase client for Server Components, Server Actions,
 * and Route Handlers.
 *
 * Must be created per-request on Vercel; module-level singletons are strictly forbidden.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Invoked from a Server Component where cookies cannot be mutated directly.
            // Handled during Server Action or Route Handler execution.
          }
        },
      },
    }
  );
}
