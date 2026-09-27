CREATE TYPE "public"."payment_verification_decision" AS ENUM('APPROVED', 'REJECTED_RETRYABLE', 'REJECTED_TERMINAL');--> statement-breakpoint
CREATE TABLE "payment_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"verifier_auth_user_id" uuid,
	"decision" "payment_verification_decision" NOT NULL,
	"rejection_reason" varchar(255),
	"verification_notes" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_verifications_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "payment_verifications_rejection_reason_required" CHECK ("payment_verifications"."decision" = 'APPROVED' OR length(trim(coalesce("payment_verifications"."rejection_reason", ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verification_claimed_by_auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verification_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_verifications" ADD CONSTRAINT "payment_verifications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_verifications" ADD CONSTRAINT "payment_verifications_submission_id_payment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."payment_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_verifications" ADD CONSTRAINT "payment_verifications_verifier_auth_user_id_fk" FOREIGN KEY ("verifier_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_verifications_payment_verified_idx" ON "payment_verifications" USING btree ("payment_id","verified_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verification_claimed_by_auth_user_id_fk" FOREIGN KEY ("verification_claimed_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_verification_queue_idx" ON "payments" USING btree ("status","resubmission_grace_expires_at","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verification_claim_consistency" CHECK (("payments"."status" = 'VERIFYING') = ("payments"."verification_claimed_at" IS NOT NULL));--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."payment_verifications" FROM "anon", "authenticated", "service_role";
