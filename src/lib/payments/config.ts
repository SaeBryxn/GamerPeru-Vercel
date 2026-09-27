import "server-only";

export interface PaymentSubmissionConfig {
  hmacSecret: string;
  idempotencyTtlMinutes: number;
}

export interface PaymentSubmissionConfigResult {
  valid: boolean;
  config?: PaymentSubmissionConfig;
  error?: string;
}

/**
 * Validates and resolves Payment Submission server runtime configuration.
 *
 * Invariants:
 * 1. Fail-closed: Returns invalid if any required configuration variable is missing or malformed.
 * 2. HMAC Secret: Must be at least 32 characters (256 bits).
 * 3. Idempotency TTL: Must be a positive bounded integer (1-10080 minutes / max 7 days). No production default.
 * 4. Production Safe: Never logs or exposes secret credentials.
 */
export function getPaymentSubmissionConfig(): PaymentSubmissionConfigResult {
  const hmacSecret = process.env.CHECKOUT_HMAC_SECRET?.trim();
  const idempotencyTtlRaw = process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES?.trim();

  if (!hmacSecret || hmacSecret.length < 32) {
    return {
      valid: false,
      error:
        "CHECKOUT_HMAC_SECRET is missing or insufficiently long (minimum 32 characters required).",
    };
  }

  if (!idempotencyTtlRaw) {
    return {
      valid: false,
      error: "PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES is missing.",
    };
  }

  const idempotencyTtlMinutes = Number(idempotencyTtlRaw);
  if (
    !Number.isInteger(idempotencyTtlMinutes) ||
    idempotencyTtlMinutes <= 0 ||
    idempotencyTtlMinutes > 10080
  ) {
    return {
      valid: false,
      error:
        "PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES must be a positive bounded integer (1-10080 minutes).",
    };
  }

  return {
    valid: true,
    config: {
      hmacSecret,
      idempotencyTtlMinutes,
    },
  };
}

export const DEFAULT_PAYMENT_RESUBMISSION_GRACE_HOURS = 24;
const MAX_PAYMENT_RESUBMISSION_GRACE_HOURS = 168;

export interface PaymentVerificationConfig {
  hmacSecret: string;
  idempotencyTtlMinutes: number;
  resubmissionGraceHours: number;
}

export type PaymentVerificationConfigResult =
  { valid: true; config: PaymentVerificationConfig } | { valid: false; error: string };

/**
 * Resolves staff payment verification configuration.
 *
 * Reuses the order-management idempotency TTL and the checkout HMAC secret (both fail-closed).
 * PAYMENT_RESUBMISSION_GRACE_HOURS is a business window, so it falls back to 24h when unset, but
 * a malformed value fails closed instead of silently shortening the customer's window.
 */
export function getPaymentVerificationConfig(): PaymentVerificationConfigResult {
  const hmacSecret = process.env.CHECKOUT_HMAC_SECRET?.trim();
  if (!hmacSecret || hmacSecret.length < 32) {
    return { valid: false, error: "CHECKOUT_HMAC_SECRET must be at least 32 characters long." };
  }

  const ttlRaw = process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES?.trim();
  const idempotencyTtlMinutes = Number(ttlRaw);
  if (!ttlRaw || !Number.isInteger(idempotencyTtlMinutes) || idempotencyTtlMinutes < 1) {
    return {
      valid: false,
      error: "ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES is missing or not a positive integer.",
    };
  }
  if (idempotencyTtlMinutes > 10080) {
    return {
      valid: false,
      error: "ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES must not exceed 10080 minutes.",
    };
  }

  const graceRaw = process.env.PAYMENT_RESUBMISSION_GRACE_HOURS?.trim();
  const resubmissionGraceHours = graceRaw
    ? Number(graceRaw)
    : DEFAULT_PAYMENT_RESUBMISSION_GRACE_HOURS;
  if (
    !Number.isInteger(resubmissionGraceHours) ||
    resubmissionGraceHours < 1 ||
    resubmissionGraceHours > MAX_PAYMENT_RESUBMISSION_GRACE_HOURS
  ) {
    return {
      valid: false,
      error: `PAYMENT_RESUBMISSION_GRACE_HOURS must be an integer between 1 and ${MAX_PAYMENT_RESUBMISSION_GRACE_HOURS}.`,
    };
  }

  return { valid: true, config: { hmacSecret, idempotencyTtlMinutes, resubmissionGraceHours } };
}
