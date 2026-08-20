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
