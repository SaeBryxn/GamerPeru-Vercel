import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles } from "@/db/schema";
import { logger } from "@/lib/logger";

/** How the shell names and pictures the signed-in operator. */
export interface AdminIdentity {
  /** First and last name from the profile; the email when there is no profile. */
  displayName: string;
  email: string | null;
  /** Gravatar for the email, asked to 404 so the UI falls back to initials. */
  avatarUrl: string | null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Gravatar accepts the SHA-256 of the trimmed, lowercased address. */
export async function gravatarUrl(email: string, size = 80): Promise<string> {
  const hash = await sha256Hex(email.trim().toLowerCase());
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/**
 * Resolves the operator's name from their own profile, never inventing one: without a
 * profile the email stands in. A failed read only costs the name, not the page.
 */
export const getAdminIdentity = cache(
  async (authUserId: string, email: string | null): Promise<AdminIdentity> => {
    let displayName: string | null = null;
    try {
      const [profile] = await db
        .select({ firstName: customerProfiles.firstName, lastName: customerProfiles.lastName })
        .from(customerProfiles)
        .where(eq(customerProfiles.authUserId, authUserId))
        .limit(1);
      const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "";
      displayName = name || null;
    } catch {
      logger.warn("Admin identity: profile name unavailable, using email.");
    }
    return {
      displayName: displayName ?? email ?? "Sesión administrativa",
      email,
      avatarUrl: email ? await gravatarUrl(email) : null,
    };
  }
);
