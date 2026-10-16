import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Request-scoped session refresh adapter for the Next.js 16 root proxy.
 *
 * Propagates Supabase auth cookies and cache safety headers between the incoming request and the
 * outgoing response. Uses getClaims() for session initialization and token refresh without
 * issuing domain database queries.
 *
 * Module evaluation must stay trivial: OpenNext loads the proxy through an esbuild CommonJS
 * wrapper that caches an empty module when the first evaluation in a Workers isolate throws or is
 * interrupted, and every later request in that isolate then fails ("adapterFn is not a
 * function"). That is why this file reads the inlined NEXT_PUBLIC_* values directly instead of
 * importing the Zod-validated publicEnv, which parses at import time.
 *
 * Authorization never depends on this adapter: protected pages and actions verify the session
 * server-side, so a failed refresh only means the request continues with its current cookies.
 */

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";

/** Blank values fall back to the local defaults, matching publicEnv. */
function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

const SUPABASE_URL = envOrDefault(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
const SUPABASE_PUBLISHABLE_KEY = envOrDefault(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  "sb_publishable_placeholder_key"
);

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/cuenta" ||
    pathname.startsWith("/cuenta/") ||
    pathname === "/auth/cambiar-password" ||
    pathname === "/auth/completar-perfil"
  );
}

function applyNoStore(response: NextResponse): void {
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Pragma", "no-cache");
}

/** Supabase stores the session in `sb-<project>-auth-token` cookies, chunked as `.0`, `.1`. */
export function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  // Without a session cookie there is nothing to refresh; skip the client entirely.
  if (hasSupabaseSessionCookie(request)) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, responseHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          supabaseResponse = NextResponse.next({ request });

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

          applyNoStore(supabaseResponse);
        },
      },
    });

    try {
      // Initialize/refresh the session via getClaims() cryptographic verification.
      await supabase.auth.getClaims();
    } catch (error) {
      console.error("Session refresh failed in proxy", error);
    }
  }

  // Protected routes always receive no-store headers, even when no cookie was written.
  if (isProtectedPath(request.nextUrl.pathname)) {
    applyNoStore(supabaseResponse);
  }

  return supabaseResponse;
}
