import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";

/** The customer profile id comes only from the verified session, never from the caller. */
export async function resolveCurrentCustomerId(): Promise<string | null> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) return null;

  const [profile] = await db
    .select({ id: customerProfiles.id })
    .from(customerProfiles)
    .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
    .limit(1);

  return profile?.id ?? null;
}
