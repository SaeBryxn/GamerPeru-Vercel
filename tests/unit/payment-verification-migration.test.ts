import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPaymentVerificationConfig } from "@/lib/payments/config";

describe("GP-028 — migration 0016 payment_verifications", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/db/migrations/0016_payment_verifications.sql"),
    "utf8"
  );

  it("creates the decision enum and the append-only verification table", () => {
    expect(migration).toContain(
      "CREATE TYPE \"public\".\"payment_verification_decision\" AS ENUM('APPROVED', 'REJECTED_RETRYABLE', 'REJECTED_TERMINAL')"
    );
    expect(migration).toContain('CREATE TABLE "payment_verifications"');
    expect(migration).toContain(
      'CONSTRAINT "payment_verifications_submission_id_unique" UNIQUE("submission_id")'
    );
    expect(migration).toContain('"payment_verifications_rejection_reason_required"');
  });

  it("keeps financial history on restrict and staff references on set null", () => {
    expect(migration).toMatch(
      /"payment_verifications_payment_id_payments_id_fk" FOREIGN KEY \("payment_id"\) REFERENCES "public"."payments"\("id"\) ON DELETE restrict/
    );
    expect(migration).toMatch(
      /"payment_verifications_submission_id_payment_submissions_id_fk" FOREIGN KEY \("submission_id"\) REFERENCES "public"."payment_submissions"\("id"\) ON DELETE restrict/
    );
    expect(migration).toMatch(
      /"payment_verifications_verifier_auth_user_id_fk" FOREIGN KEY \("verifier_auth_user_id"\) REFERENCES "auth"."users"\("id"\) ON DELETE set null/
    );
    expect(migration).toMatch(
      /"payments_verification_claimed_by_auth_user_id_fk" FOREIGN KEY \("verification_claimed_by_auth_user_id"\) REFERENCES "auth"."users"\("id"\) ON DELETE set null/
    );
  });

  it("ties the VERIFYING status to a claim and indexes the verification queue", () => {
    expect(migration).toContain(
      `CHECK (("payments"."status" = 'VERIFYING') = ("payments"."verification_claimed_at" IS NOT NULL))`
    );
    expect(migration).toContain(
      'CREATE INDEX "payments_verification_queue_idx" ON "payments" USING btree ("status","resubmission_grace_expires_at","created_at")'
    );
  });

  it("revokes Data API access to the verification table", () => {
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "public"."payment_verifications" FROM "anon", "authenticated", "service_role"'
    );
  });
});

describe("GP-028 — payment verification config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setBaseEnv() {
    process.env.CHECKOUT_HMAC_SECRET = "a".repeat(64);
    process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES = "60";
    delete process.env.PAYMENT_RESUBMISSION_GRACE_HOURS;
  }

  it("defaults the resubmission grace window to 24 hours", () => {
    setBaseEnv();
    const result = getPaymentVerificationConfig();
    expect(result).toMatchObject({ valid: true, config: { resubmissionGraceHours: 24 } });
  });

  it("accepts an explicit grace window", () => {
    setBaseEnv();
    process.env.PAYMENT_RESUBMISSION_GRACE_HOURS = "48";
    expect(getPaymentVerificationConfig()).toMatchObject({
      valid: true,
      config: { resubmissionGraceHours: 48 },
    });
  });

  it.each(["0", "169", "1.5", "doce", "-2"])("rejects a grace window of %s", (value) => {
    setBaseEnv();
    process.env.PAYMENT_RESUBMISSION_GRACE_HOURS = value;
    expect(getPaymentVerificationConfig().valid).toBe(false);
  });

  it("fails closed without the HMAC secret or idempotency TTL", () => {
    setBaseEnv();
    delete process.env.CHECKOUT_HMAC_SECRET;
    expect(getPaymentVerificationConfig().valid).toBe(false);

    setBaseEnv();
    delete process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES;
    expect(getPaymentVerificationConfig().valid).toBe(false);
  });
});
