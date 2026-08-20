import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/config/public-env";

/**
 * Request-scoped session refresh adapter for Next.js 16 root proxy.
 *
 * Propagates Supabase auth cookies and cache safety headers between incoming
 * request and outgoing response. Uses getClaims() for session initialization
 * and token refresh without issuing domain database queries.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, responseHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });

          if (responseHeaders) {
            Object.entries(responseHeaders).forEach(([key, value]) => {
              if (typeof value === "string") {
                supabaseResponse.headers.set(key, value);
              }
            });
          }

          supabaseResponse.headers.set(
            "Cache-Control",
            "private, no-cache, no-store, must-revalidate, max-age=0"
          );
          supabaseResponse.headers.set("Pragma", "no-cache");
        },
      },
    }
  );

  // Initialize/refresh session via getClaims() cryptographic verification
  await supabase.auth.getClaims();

  return supabaseResponse;
}
