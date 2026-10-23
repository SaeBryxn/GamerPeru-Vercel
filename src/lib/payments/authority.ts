import "server-only";
import { hasGuestRecoveryAccess } from "@/lib/orders/guest-recovery";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { guestPaymentAccessGrants, orders, payments, type Order, type Payment } from "@/db/schema";
import { resolveCheckoutAuthority } from "@/lib/checkout/authority";
import { getCheckoutConfig } from "@/lib/checkout/config";
import { computePaymentAuthorityBindingDigest } from "./crypto";
import { resolveExistingGuestPaymentSession } from "./guest-session";

export type ResolvedPaymentAuthority =
  | {
      authorized: true;
      order: Order;
      payment: Payment;
      authorityBindingDigest: string;
      isGuest: boolean;
    }
  | {
      authorized: false;
      code: "NOT_AVAILABLE";
      error: "Pedido no disponible.";
    };

/**
 * Resolves authoritative caller ownership over an Order's Payment.
 * Enforces unified NOT_AVAILABLE failure contract for unauthorized or nonexistent orders.
 */
export async function resolveAuthorizedPayment(
  orderNumber: string
): Promise<ResolvedPaymentAuthority> {
  const configResult = getCheckoutConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      authorized: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }
  const hmacSecret = configResult.config.hmacSecret;

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

  // 2. Locate Payment
  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);

  if (!payment) {
    return {
      authorized: false,
      code: "NOT_AVAILABLE",
      error: "Pedido no disponible.",
    };
  }

  // 3. Check Authenticated Authority
  const checkoutAuth = await resolveCheckoutAuthority();
  if (checkoutAuth.status === "AUTHENTICATED") {
    if (order.customerId && order.customerId === checkoutAuth.customerProfileId) {
      const authorityBindingDigest = computePaymentAuthorityBindingDigest(
        { type: "AUTHENTICATED", customerProfileId: checkoutAuth.customerProfileId },
        hmacSecret
      );
      return {
        authorized: true,
        order,
        payment,
        authorityBindingDigest,
        isGuest: false,
      };
    }
  }

  // 4. Check Guest Payment Session Authority
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
      const authorityBindingDigest = computePaymentAuthorityBindingDigest(
        { type: "GUEST", sessionId: guestSession.sessionId },
        hmacSecret
      );
      return {
        authorized: true,
        order,
        payment,
        authorityBindingDigest,
        isGuest: true,
      };
    }
  }

  if (await hasGuestRecoveryAccess(order)) {
    const sessionId = `recovery:${order.id}`;
    return {
      authorized: true,
      order,
      payment,
      isGuest: true,
      authorityBindingDigest: computePaymentAuthorityBindingDigest(
        { type: "GUEST", sessionId },
        hmacSecret
      ),
    };
  }

  // Unified generic denial
  return {
    authorized: false,
    code: "NOT_AVAILABLE",
    error: "Pedido no disponible.",
  };
}
