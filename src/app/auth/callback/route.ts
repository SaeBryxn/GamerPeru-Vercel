import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Handles Supabase PKCE OAuth code exchange for first-party authentication.
 * Redirects strictly to fixed first-party destinations to eliminate open-redirect risks.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const noCacheHeaders = {
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  };

  const loginErrorUrl = new URL("/auth/login?oauth_error=true", requestUrl.origin);

  if (!code) {
    return NextResponse.redirect(loginErrorUrl, {
      headers: noCacheHeaders,
    });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(loginErrorUrl, {
        headers: noCacheHeaders,
      });
    }

    const successUrl = new URL("/", requestUrl.origin);
    return NextResponse.redirect(successUrl, {
      headers: noCacheHeaders,
    });
  } catch {
    return NextResponse.redirect(loginErrorUrl, {
      headers: noCacheHeaders,
    });
  }
}
