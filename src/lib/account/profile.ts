import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";
import type { AccountProfileState } from "./types";

/**
 * Resolves the canonical CustomerProfile for the currently authenticated user.
 *
 * Invariants:
 * 1. Authority: auth_user_id is derived strictly from verified JWT claims.sub.
 * 2. Scope: Request-scoped memoization via React cache prevents duplicate DB queries.
 * 3. Security: Direct PostgreSQL query; zero PostgREST or client-supplied IDs.
 * 4. PII Protection: Zero exception-derived strings logged on failure.
 */
export const getCurrentCustomerProfile = cache(async (): Promise<AccountProfileState> => {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return { status: "UNAUTHENTICATED" };
  }

  const authUserId = verified.identity.authUserId;
  const email = verified.identity.email;

  try {
    const [profile] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, authUserId))
      .limit(1);

    if (!profile) {
      return {
        status: "NEEDS_PROFILE_COMPLETION",
        authUserId,
        email,
      };
    }

    return {
      status: "READY",
      profile: {
        id: profile.id,
        authUserId: profile.authUserId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        documentType: profile.documentType ?? null,
        documentNumber: profile.documentNumber,
        defaultShippingAddressId: profile.defaultShippingAddressId,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        email,
      },
    };
  } catch {
    logger.error({ event: "account_profile_read_failed" });
    return {
      status: "ERROR",
      error: "No se pudo cargar el perfil de usuario.",
    };
  }
});
