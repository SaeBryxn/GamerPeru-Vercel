import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicEnv } from "@/config/public-env";

export const dynamic = "force-dynamic";

/**
 * Handles Supabase PKCE OAuth code exchange for first-party authentication.
 * Redirects strictly to fixed first-party destinations based on configured NEXT_PUBLIC_SITE_URL
 * to eliminate open-redirect and Host header poisoning risks.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const noCacheHeaders = {
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  };

  const loginErrorUrl = new URL("/auth/login?oauth_error=true", publicEnv.NEXT_PUBLIC_SITE_URL);

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

    const successUrl = new URL("/", publicEnv.NEXT_PUBLIC_SITE_URL);
    return NextResponse.redirect(successUrl, {
      headers: noCacheHeaders,
    });
  } catch {
    return NextResponse.redirect(loginErrorUrl, {
      headers: noCacheHeaders,
    });
  }
}
