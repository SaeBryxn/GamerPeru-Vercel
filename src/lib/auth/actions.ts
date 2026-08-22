"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { confirmOtpSchema } from "./validation";
import { mapAuthError } from "./errors";

export interface VerifyOtpState {
  success: boolean;
  error: string | null;
}

/**
 * Server Action for explicit, scanner-safe TokenHash OTP verification.
 *
 * Invoked only upon explicit human form submission on /auth/confirm.
 * Strictly verifies email or recovery tokens and applies updated session cookies.
 * Does NOT query or mutate domain database tables (CustomerProfile/RBAC).
 */
export async function verifyConfirmationOtpAction(
  _prevState: VerifyOtpState | null,
  formData: FormData
): Promise<VerifyOtpState> {
  const rawTokenHash = formData.get("token_hash");
  const rawType = formData.get("type");

  const parsed = confirmOtpSchema.safeParse({
    tokenHash: typeof rawTokenHash === "string" ? rawTokenHash.trim() : "",
    type: typeof rawType === "string" ? rawType.trim() : "",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Parámetros de verificación inválidos o incompletos.",
    };
  }

  const { tokenHash, type } = parsed.data;

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return {
        success: false,
        error: mapAuthError(error),
      };
    }
  } catch (err) {
    return {
      success: false,
      error: mapAuthError(err),
    };
  }

  if (type === "recovery") {
    redirect("/auth/cambiar-password");
  } else {
    redirect("/auth/login?confirmed=true");
  }
}

export interface CompleteProfileState {
  success: boolean;
  error: string | null;
}

/**
 * Server action to complete initial customer profile onboarding.
 *
 * Invariants:
 * 1. Authority: auth_user_id is derived strictly from verified session claims.sub.
 * 2. Idempotency: If a profile already exists, it is never overwritten.
 * 3. Concurrency-safe: Database insertion uses ON CONFLICT DO NOTHING.
 * 4. Redirects to / on successful completion.
 */
export async function completeCustomerProfileAction(
  _prevState: CompleteProfileState | null,
  formData: FormData
): Promise<CompleteProfileState> {
  const { getVerifiedIdentity } = await import("@/lib/auth/claims");
  const { db } = await import("@/db");
  const { customerProfiles } = await import("@/db/schema");
  const { profileCompletionSchema } = await import("./validation");
  const { eq } = await import("drizzle-orm");

  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      error: "Debes iniciar sesión para completar tu perfil.",
    };
  }

  const authUserId = verified.identity.authUserId;

  const rawFirst = formData.get("firstName");
  const rawLast = formData.get("lastName");

  const parsed = profileCompletionSchema.safeParse({
    firstName: typeof rawFirst === "string" ? rawFirst : "",
    lastName: typeof rawLast === "string" ? rawLast : "",
  });

  if (!parsed.success) {
    const formatted = parsed.error.format();
    const firstErr =
      formatted.firstName?._errors[0] ??
      formatted.lastName?._errors[0] ??
      "Datos de perfil inválidos.";
    return {
      success: false,
      error: firstErr,
    };
  }

  const { firstName, lastName } = parsed.data;

  try {
    // Atomic insert with onConflictDoNothing
    await db
      .insert(customerProfiles)
      .values({
        authUserId,
        firstName,
        lastName,
      })
      .onConflictDoNothing({ target: customerProfiles.authUserId });

    // Canonical postcondition: verify the profile row exists
    const [canonical] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, authUserId))
      .limit(1);

    if (!canonical) {
      return {
        success: false,
        error: "Ocurrió un error al guardar tu perfil. Inténtalo nuevamente.",
      };
    }
  } catch {
    return {
      success: false,
      error: "Ocurrió un error al guardar tu perfil. Inténtalo nuevamente.",
    };
  }

  redirect("/");
}
