import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { guestPaymentSessions } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { PAYMENT_SESSION_COOKIE_NAME, PAYMENT_SESSION_TTL_SECONDS } from "./constants";
import { computePaymentSessionTokenDigest, generateSecurePaymentSessionToken } from "./crypto";

export type ResolvedGuestPaymentSession =
  { status: "VALID"; sessionId: string; rawToken: string; isFresh: boolean } | { status: "NONE" };

/**
 * Resolves an existing valid guest payment session from the HttpOnly cookie, or returns NONE.
 * Unknown, malformed, or expired cookies are ignored.
 */
export async function resolveExistingGuestPaymentSession(
  hmacSecret: string
): Promise<ResolvedGuestPaymentSession> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(PAYMENT_SESSION_COOKIE_NAME)?.value;

  if (!tokenCookie || tokenCookie.length < 32) {
    return { status: "NONE" };
  }

  const tokenDigest = computePaymentSessionTokenDigest(tokenCookie, hmacSecret);
  const now = new Date();

  const [session] = await db
    .select({
      id: guestPaymentSessions.id,
      expiresAt: guestPaymentSessions.expiresAt,
    })
    .from(guestPaymentSessions)
    .where(
      and(
        eq(guestPaymentSessions.tokenDigest, tokenDigest),
        gt(guestPaymentSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!session) {
    return { status: "NONE" };
  }

  return {
    status: "VALID",
    sessionId: session.id,
    rawToken: tokenCookie,
    isFresh: false,
  };
}

/**
 * Ensures a valid guest payment session exists, reusing an existing valid session or provisioning a fresh one.
 */
export async function getOrCreateGuestPaymentSession(
  hmacSecret: string
): Promise<{ sessionId: string; rawToken: string; isFresh: boolean }> {
  const existing = await resolveExistingGuestPaymentSession(hmacSecret);
  if (existing.status === "VALID") {
    return existing;
  }

  const rawToken = generateSecurePaymentSessionToken();
  const sessionId = generateUuidV7();
  return {
    sessionId,
    rawToken,
    isFresh: true,
  };
}

/**
 * Attaches or refreshes the HttpOnly guest payment session cookie.
 */
export async function setGuestPaymentSessionCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PAYMENT_SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: PAYMENT_SESSION_TTL_SECONDS,
  });
}
