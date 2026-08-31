import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Generates a 256-bit cryptographically secure random token encoded in base64url format.
 */
export function generateSecurePaymentSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Computes a domain-separated HMAC-SHA256 digest of the raw guest payment session token.
 */
export function computePaymentSessionTokenDigest(rawToken: string, hmacSecret: string): string {
  return createHmac("sha256", hmacSecret).update(`guest_payment_session:${rawToken}`).digest("hex");
}

export type PaymentAuthorityInput =
  { type: "AUTHENTICATED"; customerProfileId: string } | { type: "GUEST"; sessionId: string };

/**
 * Computes a domain-separated authority binding digest for payment submissions.
 */
export function computePaymentAuthorityBindingDigest(
  input: PaymentAuthorityInput,
  hmacSecret: string
): string {
  const content =
    input.type === "AUTHENTICATED"
      ? `auth_customer:${input.customerProfileId}`
      : `guest_session:${input.sessionId}`;

  return createHmac("sha256", hmacSecret).update(`payment_authority:${content}`).digest("hex");
}

/**
 * Computes a domain-separated HMAC-SHA256 request fingerprint for payment submission idempotency.
 * Raw operation codes are never stored or logged in the clear.
 */
export function computePaymentSubmissionFingerprint(
  params: {
    paymentId: string;
    normalizedOpCode: string;
    uploadIntentId: string | null;
    authorityBindingDigest: string;
  },
  hmacSecret: string
): string {
  const content = [
    params.paymentId,
    params.normalizedOpCode,
    params.uploadIntentId ?? "NO_PROOF",
    params.authorityBindingDigest,
  ].join("|");

  return createHmac("sha256", hmacSecret)
    .update(`payment_submission_intent:${content}`)
    .digest("hex");
}
