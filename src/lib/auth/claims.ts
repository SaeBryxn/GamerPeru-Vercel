import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface VerifiedIdentity {
  authUserId: string;
  email: string | null;
  claims: Record<string, unknown>;
}

export type VerifiedIdentityResult =
  | { success: true; identity: VerifiedIdentity }
  | { success: false; reason: "no_session" | "invalid_claims" | "error" };

/**
 * Resolves verified identity using request-scoped Supabase client and getClaims().
 *
 * Validates JWT cryptographic signature and expiry against project JWKS.
 * Derives authUserId strictly from verified `claims.sub`.
 * Does NOT query CustomerProfile or RBAC (reserved for later gates).
 */
export async function getVerifiedIdentity(): Promise<VerifiedIdentityResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data || !data.claims) {
      return { success: false, reason: "no_session" };
    }

    const claims = data.claims as Record<string, unknown>;
    const sub = typeof claims.sub === "string" ? claims.sub.trim() : null;

    if (!sub) {
      return { success: false, reason: "invalid_claims" };
    }

    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;

    return {
      success: true,
      identity: {
        authUserId: sub,
        email,
        claims,
      },
    };
  } catch {
    return { success: false, reason: "error" };
  }
}
