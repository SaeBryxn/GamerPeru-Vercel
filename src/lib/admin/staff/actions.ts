"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/admin/catalog/actions";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { STAFF_CHANGE_MESSAGES, STAFF_LEVELS, type StaffLevel } from "./levels";
import { changeStaffAccess, type StaffChangeOutcome } from "./service";

const levelSchema = z.enum(STAFF_LEVELS);

const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  level: levelSchema,
});

const changeSchema = z.object({
  authUserId: z.string().uuid(),
  level: levelSchema.nullable(),
});

export interface StaffActionData {
  email: string | null;
  action: "grant" | "change" | "revoke";
}

async function requireStaffManager(): Promise<
  { ok: true; authUserId: string } | { ok: false; result: ActionResult<StaffActionData> }
> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      ok: false,
      result: {
        success: false,
        error: "Debes iniciar sesión con una cuenta de personal autorizada.",
        code: "AUTHENTICATION_REQUIRED",
      },
    };
  }
  if (!authContext.permissions.has("staff:manage")) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Solo un superadministrador puede gestionar el equipo.",
        code: "FORBIDDEN",
      },
    };
  }
  return { ok: true, authUserId: authContext.authUserId };
}

function toActionResult(outcome: StaffChangeOutcome): ActionResult<StaffActionData> {
  if (outcome.ok) {
    revalidatePath("/admin/equipo");
    return { success: true, data: { email: outcome.email, action: outcome.action } };
  }
  if (outcome.error === "USER_NOT_FOUND") {
    return {
      success: false,
      error:
        "No hay una cuenta registrada con ese correo. La persona debe crear su cuenta en la tienda primero.",
      code: outcome.error,
    };
  }
  return { success: false, error: STAFF_CHANGE_MESSAGES[outcome.error], code: outcome.error };
}

/** Gives a registered account an administrative level, or changes the one it has. */
export async function grantStaffAccessAction(input: {
  email: string;
  level: StaffLevel;
}): Promise<ActionResult<StaffActionData>> {
  const actor = await requireStaffManager();
  if (!actor.ok) return actor.result;

  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Ingresa un correo y un nivel válidos.",
      code: "INVALID_INPUT",
    };
  }

  return toActionResult(
    await changeStaffAccess({
      actorAuthUserId: actor.authUserId,
      target: { email: parsed.data.email },
      nextLevel: parsed.data.level,
    })
  );
}

/** Changes a member's level, or revokes administrative access with `level: null`. */
export async function changeStaffAccessAction(input: {
  authUserId: string;
  level: StaffLevel | null;
}): Promise<ActionResult<StaffActionData>> {
  const actor = await requireStaffManager();
  if (!actor.ok) return actor.result;

  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "La solicitud no es válida.", code: "INVALID_INPUT" };
  }

  return toActionResult(
    await changeStaffAccess({
      actorAuthUserId: actor.authUserId,
      target: { authUserId: parsed.data.authUserId },
      nextLevel: parsed.data.level,
    })
  );
}
