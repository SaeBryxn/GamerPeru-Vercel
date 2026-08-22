import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles, type CustomerProfile } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type EnsureProfileResult =
  | { status: "READY"; profile: CustomerProfile }
  | { status: "NEEDS_PROFILE_COMPLETION" }
  | { status: "UNAUTHENTICATED" }
  | { status: "ERROR"; error: string };

function normalizeName(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return trimmed;
}

/**
 * Ensures a canonical CustomerProfile exists for the currently authenticated user.
 *
 * Invariants:
 * 1. Authority: auth_user_id is derived strictly from verified JWT claims.sub.
 * 2. Idempotency: Existing CustomerProfile is returned immediately without overwrite.
 * 3. Precedence: Signup metadata (first_name + last_name) > Google identity (given_name + family_name).
 * 4. No heuristic full-name splitting.
 * 5. Concurrency-safe: Database insertion uses ON CONFLICT (auth_user_id) DO NOTHING.
 * 6. Missing names fallback to NEEDS_PROFILE_COMPLETION.
 */
export async function ensureCustomerProfile(): Promise<EnsureProfileResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return { status: "UNAUTHENTICATED" };
  }

  const authUserId = verified.identity.authUserId;

  // 1. Check for existing canonical profile
  const [existing] = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.authUserId, authUserId))
    .limit(1);

  if (existing) {
    return { status: "READY", profile: existing };
  }

  // 2. Fetch fresh Auth user record for bootstrap metadata
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user || userData.user.id !== authUserId) {
    return { status: "ERROR", error: "identity_mismatch" };
  }

  const user = userData.user;

  // 3. Name resolution with deterministic precedence
  let resolvedFirstName: string | null = null;
  let resolvedLastName: string | null = null;

  // Source A: Valid signup metadata pair
  const signupFirst = normalizeName(user.user_metadata?.first_name);
  const signupLast = normalizeName(user.user_metadata?.last_name);

  if (signupFirst && signupLast) {
    resolvedFirstName = signupFirst;
    resolvedLastName = signupLast;
  } else {
    // Source B: Valid Google identity metadata pair
    const googleIdentity = user.identities?.find((id) => id.provider === "google");
    const googleFirst = normalizeName(
      googleIdentity?.identity_data?.given_name ?? user.user_metadata?.given_name
    );
    const googleLast = normalizeName(
      googleIdentity?.identity_data?.family_name ?? user.user_metadata?.family_name
    );

    if (googleFirst && googleLast) {
      resolvedFirstName = googleFirst;
      resolvedLastName = googleLast;
    }
  }

  // If no coherent complete pair from a single source, require manual onboarding
  if (!resolvedFirstName || !resolvedLastName) {
    return { status: "NEEDS_PROFILE_COMPLETION" };
  }

  // 4. Concurrency-safe insertion
  try {
    await db
      .insert(customerProfiles)
      .values({
        authUserId,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
      })
      .onConflictDoNothing({ target: customerProfiles.authUserId });

    const [canonical] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, authUserId))
      .limit(1);

    if (!canonical) {
      return { status: "ERROR", error: "profile_creation_failed" };
    }

    return { status: "READY", profile: canonical };
  } catch {
    return { status: "ERROR", error: "database_error" };
  }
}
