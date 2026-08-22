import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { publicEnv } from "@/config/public-env";
import { mapAuthError } from "./errors";

/**
 * Initiates Google OAuth from the browser directly to Supabase Auth.
 * Builds redirectTo strictly from configured first-party site URL to prevent open redirects.
 */
export async function initiateGoogleOAuth(): Promise<{ error: string | null }> {
  try {
    const supabase = createBrowserSupabaseClient();
    const redirectTo = new URL("/auth/callback", publicEnv.NEXT_PUBLIC_SITE_URL).toString();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      return { error: mapAuthError(error) };
    }

    return { error: null };
  } catch (err) {
    return { error: mapAuthError(err) };
  }
}
