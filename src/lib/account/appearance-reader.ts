import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { defaultCustomerAppearance, readCustomerAppearance } from "./appearance";

export const getCurrentCustomerAppearance = cache(async () => {
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { appearance: defaultCustomerAppearance(), available: false };
    return { appearance: readCustomerAppearance(data.user.user_metadata), available: true };
  } catch {
    return { appearance: defaultCustomerAppearance(), available: false };
  }
});
