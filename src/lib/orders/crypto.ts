import "server-only";
import { createHmac } from "node:crypto";

export type OrderAuthorityInput =
  | { type: "AUTHENTICATED"; customerProfileId: string }
  | { type: "GUEST"; sessionId: string }
  | { type: "STAFF"; authUserId: string }
  | { type: "SYSTEM" };

/**
 * Computes a domain-separated authority binding digest for order management.
 */
export function computeOrderAuthorityBindingDigest(
  input: OrderAuthorityInput,
  hmacSecret: string
): string {
  let content = "";
  if (input.type === "AUTHENTICATED") {
    content = `auth_customer:${input.customerProfileId}`;
  } else if (input.type === "GUEST") {
    content = `guest_session:${input.sessionId}`;
  } else if (input.type === "STAFF") {
    content = `staff:${input.authUserId}`;
  } else {
    content = "system:worker";
  }

  return createHmac("sha256", hmacSecret).update(`order_authority:${content}`).digest("hex");
}

/**
 * Computes a domain-separated HMAC-SHA256 request fingerprint for order cancellation idempotency.
 */
export function computeOrderCancellationFingerprint(
  params: {
    orderId: string;
    normalizedReason: string;
    authorityBindingDigest: string;
  },
  hmacSecret: string
): string {
  const content = [params.orderId, params.normalizedReason, params.authorityBindingDigest].join(
    "|"
  );

  return createHmac("sha256", hmacSecret)
    .update(`order_cancellation_intent:${content}`)
    .digest("hex");
}

/**
 * Computes a domain-separated HMAC-SHA256 request fingerprint for paid order cancellation idempotency.
 * Binds orderId, normalizedReason, externalReference (or explicit NO_EXTERNAL_REF sentinel), and authorityBindingDigest.
 * Preserves leading zeroes and special characters in externalReference without numeric casting.
 */
export function computePaidOrderCancellationFingerprint(
  params: {
    orderId: string;
    normalizedReason: string;
    externalReference: string | null;
    authorityBindingDigest: string;
  },
  hmacSecret: string
): string {
  const content = [
    params.orderId,
    params.normalizedReason,
    params.externalReference ?? "NO_EXTERNAL_REF",
    params.authorityBindingDigest,
  ].join("|");

  return createHmac("sha256", hmacSecret)
    .update(`paid_order_cancellation_intent:${content}`)
    .digest("hex");
}

/**
 * Computes a domain-separated HMAC-SHA256 request fingerprint for refund recording idempotency.
 */
export function computeRefundFingerprint(
  params: {
    paymentId: string;
    amountCents: number;
    normalizedReason: string;
    externalReference: string | null;
    authorityBindingDigest: string;
  },
  hmacSecret: string
): string {
  const content = [
    params.paymentId,
    params.amountCents.toString(),
    params.normalizedReason,
    params.externalReference ?? "NO_EXTERNAL_REF",
    params.authorityBindingDigest,
  ].join("|");

  return createHmac("sha256", hmacSecret).update(`refund_intent:${content}`).digest("hex");
}

/**
 * Derives a deterministic 32-bit signed integer for PostgreSQL pg_advisory_xact_lock(int4).
 */
export function createOrderAdvisoryLockKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
