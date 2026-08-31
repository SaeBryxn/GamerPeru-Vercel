ALTER TYPE "public"."security_class" ADD VALUE 'PRIVATE_PAYMENT_INSTRUCTION' BEFORE 'PRIVATE_BACKUP';--> statement-breakpoint
CREATE TABLE "guest_payment_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_payment_sessions_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
CREATE TABLE "guest_payment_access_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_payment_access_grants_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "payment_proof_upload_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"authority_binding_digest" varchar(64) NOT NULL,
	"staging_object_key" varchar(500) NOT NULL,
	"declared_mime_type" varchar(100) NOT NULL,
	"declared_size_bytes" integer NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "payment_proof_upload_intents_staging_object_key_unique" UNIQUE("staging_object_key"),
	CONSTRAINT "payment_proof_upload_intents_status_check" CHECK ("payment_proof_upload_intents"."status" IN ('PENDING', 'FINALIZED', 'ABANDONED')),
	CONSTRAINT "payment_proof_upload_intents_size_check" CHECK ("payment_proof_upload_intents"."declared_size_bytes" > 0 AND "payment_proof_upload_intents"."declared_size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "payment_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"operation_code" varchar(50) NOT NULL,
	"proof_media_id" uuid,
	"customer_notes" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_submissions_proof_media_id_unique" UNIQUE("proof_media_id"),
	CONSTRAINT "payment_submissions_payment_attempt_unique" UNIQUE("payment_id","attempt_number"),
	CONSTRAINT "payment_submissions_attempt_number_positive" CHECK ("payment_submissions"."attempt_number" > 0),
	CONSTRAINT "payment_submissions_operation_code_not_empty" CHECK (length(trim("payment_submissions"."operation_code")) > 0)
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "source_cart_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_payment_access_grants" ADD CONSTRAINT "guest_payment_access_grants_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_payment_access_grants" ADD CONSTRAINT "guest_payment_access_grants_session_id_guest_payment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."guest_payment_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proof_upload_intents" ADD CONSTRAINT "payment_proof_upload_intents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_proof_media_id_media_assets_id_fk" FOREIGN KEY ("proof_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_payment_access_grants_session_id_idx" ON "guest_payment_access_grants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "payment_proof_upload_intents_payment_id_idx" ON "payment_proof_upload_intents" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_proof_upload_intents_status_expires_at_idx" ON "payment_proof_upload_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payment_submissions_operation_code_submitted_idx" ON "payment_submissions" USING btree ("operation_code","submitted_at");--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_creation_source_cart_check" CHECK ("idempotency_keys"."operation_type" != 'ORDER_CREATION' OR "idempotency_keys"."source_cart_id" IS NOT NULL);