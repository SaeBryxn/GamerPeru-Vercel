import "server-only";
import { resolveCartAuthority } from "@/lib/cart/session";
import type { AuthorityDigestInput } from "./crypto";

export type ResolvedCheckoutAuthority =
  | {
      status: "AUTHENTICATED";
      customerProfileId: string;
      authUserId: string;
      guestToken: string | null;
      digestInput: AuthorityDigestInput;
    }
  | {
      status: "GUEST";
      guestToken: string;
      digestInput: AuthorityDigestInput;
    }
  | {
      status: "PROFILE_REQUIRED";
      authUserId: string;
    }
  | {
      status: "NO_CART_SESSION";
    };

/**
 * Resolves current server-authoritative checkout authority.
 *
 * Invariants:
 * 1. Authenticated: Resolves CustomerProfile.id from verified JWT claims.
 * 2. Profile Required: If authenticated without a CustomerProfile, fails closed with PROFILE_REQUIRED.
 * 3. Guest: Uses authoritative HttpOnly guest cart session token.
 * 4. No Downgrade: Authenticated users are never downgraded to anonymous authority.
 */
export async function resolveCheckoutAuthority(): Promise<ResolvedCheckoutAuthority> {
  const cartAuth = await resolveCartAuthority();

  if (cartAuth.status === "AUTHENTICATED_WITH_PROFILE") {
    return {
      status: "AUTHENTICATED",
      customerProfileId: cartAuth.customerProfileId,
      authUserId: cartAuth.authUserId,
      guestToken: cartAuth.guestToken,
      digestInput: {
        type: "AUTHENTICATED",
        customerProfileId: cartAuth.customerProfileId,
      },
    };
  }

  if (cartAuth.status === "AUTHENTICATED_PROFILE_REQUIRED") {
    return {
      status: "PROFILE_REQUIRED",
      authUserId: cartAuth.authUserId,
    };
  }

  if (cartAuth.status === "UNAUTHENTICATED") {
    if (!cartAuth.guestToken || cartAuth.isMalformedGuest) {
      return { status: "NO_CART_SESSION" };
    }
    return {
      status: "GUEST",
      guestToken: cartAuth.guestToken,
      digestInput: {
        type: "GUEST",
        guestToken: cartAuth.guestToken,
      },
    };
  }

  return { status: "NO_CART_SESSION" };
}
