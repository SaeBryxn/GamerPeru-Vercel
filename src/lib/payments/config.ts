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
