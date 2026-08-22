"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";
import { validateUpdateProfileInput } from "./validation";
import type { UpdateProfileInput, UpdateProfileResult } from "./types";

/**
 * Server Action to update the authenticated customer's profile fields.
 *
 * Invariants:
 * 1. Authority: auth_user_id is derived strictly from verified JWT claims.sub.
 * 2. IDOR Prevention: No caller customer_id or profile_id is accepted or trusted.
 * 3. Scope: Only updates approved editable profile fields (first_name, last_name, phone, document_type, document_number).
 * 4. Preservation: id, auth_user_id, default_shipping_address_id, and created_at remain untouched.
 * 5. PII Protection: Zero customer PII or query values logged.
 */
export async function updateCustomerProfileAction(
  _prevState: unknown,
  formData: FormData | UpdateProfileInput
): Promise<UpdateProfileResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      errors: { form: "No has iniciado sesión o tu sesión ha expirado." },
    };
  }

  const authUserId = verified.identity.authUserId;

  let rawInput: UpdateProfileInput;
  if (formData instanceof FormData) {
    rawInput = {
      firstName: (formData.get("firstName") as string) ?? "",
      lastName: (formData.get("lastName") as string) ?? "",
      phone: (formData.get("phone") as string) ?? null,
      documentType: (formData.get("documentType") as string) ?? null,
      documentNumber: (formData.get("documentNumber") as string) ?? null,
    };
  } else {
    rawInput = formData;
  }

  const validation = validateUpdateProfileInput(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    const [updated] = await db
      .update(customerProfiles)
      .set({
        firstName: validation.data.firstName,
        lastName: validation.data.lastName,
        phone: validation.data.phone,
        documentType: validation.data.documentType,
        documentNumber: validation.data.documentNumber,
        updatedAt: new Date(),
      })
      .where(eq(customerProfiles.authUserId, authUserId))
      .returning();

    if (!updated) {
      return {
        success: false,
        errors: { form: "Perfil no encontrado o no autorizado." },
      };
    }

    revalidatePath("/cuenta");
    revalidatePath("/cuenta/perfil");

    return {
      success: true,
      message: "Perfil actualizado correctamente.",
      profile: updated,
    };
  } catch (error) {
    logger.error({
      event: "account_profile_update_failed",
      reason: error instanceof Error ? error.message : "unknown_database_error",
    });
    return {
      success: false,
      errors: { form: "Ocurrió un error inesperado al actualizar el perfil. Intenta nuevamente." },
    };
  }
}
