"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { customerAppearanceSchema, type CustomerAppearance } from "./appearance";

export async function updateCustomerAppearanceAction(
  input: unknown
): Promise<{ success: true; appearance: CustomerAppearance } | { success: false; error: string }> {
  const parsed = customerAppearanceSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Revisa tu perfil." };
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      return { success: false, error: "Inicia sesión de nuevo para guardar tu perfil." };
    // Auth updates the current session's user. No customer ID or authorization metadata is accepted.
    const updated = await client.auth.updateUser({ data: { gamerperu_profile: parsed.data } });
    if (updated.error || !updated.data.user)
      return {
        success: false,
        error: "No pudimos guardar la personalización. Inténtalo de nuevo.",
      };
    revalidatePath("/cuenta", "layout");
    return { success: true, appearance: parsed.data };
  } catch {
    return {
      success: false,
      error: "No pudimos conectar. Tus cambios siguen aquí para volver a guardar.",
    };
  }
}
