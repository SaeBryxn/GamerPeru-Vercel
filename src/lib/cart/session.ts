import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import {
  ANONYMOUS_CART_COOKIE_NAME_DEV,
  ANONYMOUS_CART_COOKIE_NAME_PROD,
  ANONYMOUS_TOKEN_BYTES,
  CART_COOKIE_MAX_AGE_SECONDS,
  CART_COOKIE_PATH,
  CART_COOKIE_SAME_SITE,
} from "./constants";
import type { CartAuthority } from "./internal-types";
import { validateSessionToken } from "./validation";

/**
 * Returns the canonical cookie name according to current execution environment.
 */
export function getCartCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? ANONYMOUS_CART_COOKIE_NAME_PROD
    : ANONYMOUS_CART_COOKIE_NAME_DEV;
}

/**
 * Generates a 256-bit cryptographically random anonymous session token.
 * Output: exactly 43 characters base64url string.
 */
export function generateAnonymousSessionToken(): string {
  return randomBytes(ANONYMOUS_TOKEN_BYTES).toString("base64url");
}

/**
 * Extracts and validates the anonymous cart session token from request cookies.
 */
export async function getAnonymousTokenFromCookie(): Promise<{
  token: string | null;
  isMalformed: boolean;
}> {
  const cookieStore = await cookies();
  const cookieName = getCartCookieName();
  const cookie = cookieStore.get(cookieName);

  if (!cookie || !cookie.value) {
    return { token: null, isMalformed: false };
  }

  const rawValue = cookie.value.trim();
  if (!validateSessionToken(rawValue)) {
    return { token: null, isMalformed: true };
  }

  return { token: rawValue, isMalformed: false };
}

/**
 * Sets the anonymous cart session cookie in response headers.
 * Invariant: Must only be invoked AFTER successful database transaction commit.
 */
export async function setAnonymousCartCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getCartCookieName();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: CART_COOKIE_SAME_SITE,
    path: CART_COOKIE_PATH,
    maxAge: CART_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Clears the anonymous cart session cookie.
 * Invariant: Invoked upon guest merge completion or when stale/malformed token is discarded.
 */
export async function clearAnonymousCartCookie(): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getCartCookieName();
  cookieStore.delete(cookieName);
}

/**
 * Resolves current Cart authority by inspecting verified JWT claims, CustomerProfile,
 * and request cookies.
 *
 * Invariants:
 * 1. Claims verification: Verified via getVerifiedIdentity().
 * 2. Profile resolution: Checks customer_profiles 1-to-1 link with auth.users id.
 * 3. Profile Required: If JWT is valid but CustomerProfile is missing, fails closed with
 *    AUTHENTICATED_PROFILE_REQUIRED (never downgraded to anonymous).
 * 4. Guest Session: Only unauthenticated or authenticated-carrying-guest requests inspect guest cookie.
 */
export async function resolveCartAuthority(): Promise<CartAuthority> {
  const verified = await getVerifiedIdentity();

  if (verified.success) {
    const authUserId = verified.identity.authUserId;
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, authUserId))
      .limit(1);

    if (!profile) {
      return {
        status: "AUTHENTICATED_PROFILE_REQUIRED",
        authUserId,
      };
    }

    const guest = await getAnonymousTokenFromCookie();
    return {
      status: "AUTHENTICATED_WITH_PROFILE",
      customerProfileId: profile.id,
      authUserId,
      guestToken: guest.token,
      isMalformedGuest: guest.isMalformed,
    };
  }

  const guest = await getAnonymousTokenFromCookie();
  return {
    status: "UNAUTHENTICATED",
    guestToken: guest.token,
    isMalformedGuest: guest.isMalformed,
  };
}
