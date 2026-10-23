import "server-only";
import { hasGuestRecoveryAccess } from "@/lib/orders/guest-recovery";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { guestPaymentAccessGrants, orders, payments, type Order, type Payment } from "@/db/schema";
import { resolveCheckoutAuthority } from "@/lib/checkout/authority";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { getOrderManagementConfig } from "./config";
import { computeOrderAuthorityBindingDigest } from "./crypto";
import { resolveExistingGuestPaymentSession } from "@/lib/payments/guest-session";

export type ResolvedOrderAuthority =
  | {
      authorized: true;
      role: "CUSTOMER";
      customerProfileId: string;
      order: Order;
      payment: Payment;
      authorityBindingDigest: string;
    }
  | {
      authorized: true;
      role: "GUEST";
      sessionId: string;
      order: Order;
      payment: Payment;
      authorityBindingDigest: string;
    }
  | {
      authorized: true;
      role: "STAFF";
      authUserId: string;
      order: Order;
      payment: Payment;
      authorityBindingDigest: string;
    }
  | {
      authorized: false;
      code: "NOT_AVAILABLE";
      error: "Pedido no disponible.";
    };

/**
 * Resolves caller ownership or staff administrative authority over an Order and its Payment.
 *
 * Invariants:
 * 1. Authenticated Customer: Derived from verified customer profile matching order.customerId.
 * 2. Guest Owner: Verified via unexpired gp_payment_session and active guest_payment_access_grants.
 * 3. Staff: Verified via RBAC permission 'orders:manage'.
 * 4. Anti-Oracle Non-Disclosure: Unauthorized callers receive identical NOT_AVAILABLE response.
 */
export async function resolveAuthorizedOrder(orderNumber: string): Promise<ResolvedOrderAuthority> {
  const configResult = getOrderManagementConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      authorized: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }
  const { hmacSecret } = configResult.config;

  // 1. Locate Order
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) {
    return {
      authorized: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  // 2. Locate Associated Payment
  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);

  if (!payment) {
    return {
      authorized: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  // 3. Check Staff Authority (orders:manage)
  try {
    const authContext = await getVerifiedAuthContext();
    if (authContext.status === "READY" && authContext.authUserId) {
      if (authContext.permissions.has("orders:manage")) {
        const authorityBindingDigest = computeOrderAuthorityBindingDigest(
          { type: "STAFF", authUserId: authContext.authUserId },
          hmacSecret
        );
        return {
          authorized: true,
          role: "STAFF",
          authUserId: authContext.authUserId,
          order,
          payment,
          authorityBindingDigest,
        };
      }
    }
  } catch {
    // Non-staff or unauthenticated; fall through to customer/guest evaluation
  }

  // 4. Check Authenticated Customer Owner Authority
  const checkoutAuth = await resolveCheckoutAuthority();
  if (checkoutAuth.status === "AUTHENTICATED") {
    if (order.customerId && order.customerId === checkoutAuth.customerProfileId) {
      const authorityBindingDigest = computeOrderAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: checkoutAuth.customerProfileId },
        hmacSecret
      );
      return {
        authorized: true,
        role: "CUSTOMER",
        customerProfileId: checkoutAuth.customerProfileId,
        order,
        payment,
        authorityBindingDigest,
      };
    }
  }

  // 5. Check Guest Payment Session Authority
  const guestSession = await resolveExistingGuestPaymentSession(hmacSecret);
  if (guestSession.status === "VALID") {
    const now = new Date();
    const [grant] = await db
      .select({ id: guestPaymentAccessGrants.id })
      .from(guestPaymentAccessGrants)
      .where(
        and(
          eq(guestPaymentAccessGrants.paymentId, payment.id),
          eq(guestPaymentAccessGrants.sessionId, guestSession.sessionId),
          gt(guestPaymentAccessGrants.expiresAt, now)
        )
      )
      .limit(1);

    if (grant) {
      const authorityBindingDigest = computeOrderAuthorityBindingDigest(
        { type: "GUEST", sessionId: guestSession.sessionId },
        hmacSecret
      );
      return {
        authorized: true,
        role: "GUEST",
        sessionId: guestSession.sessionId,
        order,
        payment,
        authorityBindingDigest,
      };
    }
  }

  // 6. Anti-Oracle Fail-Closed Response
  if (await hasGuestRecoveryAccess(order)) {
    const sessionId = `recovery:${order.id}`;
    return {
      authorized: true,
      order,
      payment,
      role: "GUEST",
      sessionId,
      authorityBindingDigest: computeOrderAuthorityBindingDigest(
        { type: "GUEST", sessionId },
        hmacSecret
      ),
    };
  }

  return {
    authorized: false,
    code: "NOT_AVAILABLE",
    error: "Pedido no disponible.",
  };
}
