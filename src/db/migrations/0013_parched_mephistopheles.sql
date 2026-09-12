CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_provider_key_unique" UNIQUE("provider_key")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" uuid NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"masked_key" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"last_health_status" varchar(30),
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_credentials_key_version_positive" CHECK ("ai_provider_credentials"."key_version" > 0),
	CONSTRAINT "ai_provider_credentials_ciphertext_format" CHECK ("ai_provider_credentials"."ciphertext" ~ '^[0-9a-f]+$' AND length("ai_provider_credentials"."ciphertext") % 2 = 0 AND length("ai_provider_credentials"."ciphertext") > 0),
	CONSTRAINT "ai_provider_credentials_iv_format" CHECK ("ai_provider_credentials"."iv" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "ai_provider_credentials_auth_tag_format" CHECK ("ai_provider_credentials"."auth_tag" ~ '^[0-9a-f]{32}$'),
	CONSTRAINT "ai_provider_credentials_status_check" CHECK ("ai_provider_credentials"."status" IN ('ACTIVE', 'REVOKED')),
	CONSTRAINT "ai_provider_credentials_health_status_check" CHECK ("ai_provider_credentials"."last_health_status" IS NULL OR "ai_provider_credentials"."last_health_status" IN ('HEALTHY', 'UNHEALTHY', 'UNTESTED'))
);
--> statement-breakpoint
CREATE TABLE "ai_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_key" varchar(50) NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.20' NOT NULL,
	"max_tokens" integer DEFAULT 4096 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_profiles_profile_key_unique" UNIQUE("profile_key"),
	CONSTRAINT "ai_profiles_temperature_range" CHECK ("ai_profiles"."temperature" >= 0.00 AND "ai_profiles"."temperature" <= 2.00),
	CONSTRAINT "ai_profiles_max_tokens_positive" CHECK ("ai_profiles"."max_tokens" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_research_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mutation_request_digest" varchar(64) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"selected_profile_id" uuid NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"job_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"dispatch_status" varchar(20) DEFAULT 'PENDING_DISPATCH' NOT NULL,
	"inngest_event_id" varchar(128) NOT NULL,
	"total_items" integer DEFAULT 1 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"created_by_auth_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_research_jobs_mutation_request_digest_unique" UNIQUE("mutation_request_digest"),
	CONSTRAINT "ai_research_jobs_inngest_event_id_unique" UNIQUE("inngest_event_id"),
	CONSTRAINT "ai_research_jobs_mutation_request_digest_format" CHECK ("ai_research_jobs"."mutation_request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_research_jobs_request_fingerprint_format" CHECK ("ai_research_jobs"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_research_jobs_job_type_check" CHECK ("ai_research_jobs"."job_type" IN ('SINGLE', 'BATCH')),
	CONSTRAINT "ai_research_jobs_status_check" CHECK ("ai_research_jobs"."status" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED')),
	CONSTRAINT "ai_research_jobs_dispatch_status_check" CHECK ("ai_research_jobs"."dispatch_status" IN ('PENDING_DISPATCH', 'DISPATCHED', 'DISPATCH_FAILED')),
	CONSTRAINT "ai_research_jobs_total_items_positive" CHECK ("ai_research_jobs"."total_items" > 0),
	CONSTRAINT "ai_research_jobs_completed_items_non_negative" CHECK ("ai_research_jobs"."completed_items" >= 0),
	CONSTRAINT "ai_research_jobs_failed_items_non_negative" CHECK ("ai_research_jobs"."failed_items" >= 0),
	CONSTRAINT "ai_research_jobs_items_sum_check" CHECK ("ai_research_jobs"."completed_items" + "ai_research_jobs"."failed_items" <= "ai_research_jobs"."total_items")
);
--> statement-breakpoint
CREATE TABLE "ai_research_job_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"item_index" integer NOT NULL,
	"input_query" text NOT NULL,
	"mode" varchar(20) DEFAULT 'CREATE' NOT NULL,
	"target_product_id" uuid,
	"target_product_version_snapshot" timestamp with time zone,
	"identity_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"processing_lease_token" uuid,
	"processing_lease_expires_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"error_code" varchar(50),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_research_job_items_job_id_item_index_unique" UNIQUE("job_id","item_index"),
	CONSTRAINT "ai_research_job_items_item_index_non_negative" CHECK ("ai_research_job_items"."item_index" >= 0),
	CONSTRAINT "ai_research_job_items_mode_check" CHECK ("ai_research_job_items"."mode" IN ('CREATE', 'ENRICH')),
	CONSTRAINT "ai_research_job_items_identity_status_check" CHECK ("ai_research_job_items"."identity_status" IN ('PENDING', 'EXACT_MATCH', 'PROBABLE_MATCH', 'AMBIGUOUS', 'UNSUPPORTED_CATEGORY', 'CONFLICTING_IDENTIFIERS', 'MANUALLY_DISAMBIGUATED')),
	CONSTRAINT "ai_research_job_items_status_check" CHECK ("ai_research_job_items"."status" IN ('PENDING', 'RESEARCHING', 'READY_FOR_REVIEW', 'NEEDS_ATTENTION', 'AMBIGUOUS', 'SOURCE_CONFLICT', 'FAILED', 'APPROVED', 'APPLIED')),
	CONSTRAINT "ai_research_job_items_mode_product_snapshot_check" CHECK (("ai_research_job_items"."mode" = 'CREATE' AND "ai_research_job_items"."target_product_id" IS NULL AND "ai_research_job_items"."target_product_version_snapshot" IS NULL) OR ("ai_research_job_items"."mode" = 'ENRICH' AND "ai_research_job_items"."target_product_id" IS NOT NULL AND "ai_research_job_items"."target_product_version_snapshot" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_item_id" uuid NOT NULL,
	"original_url" text,
	"resolved_url" text,
	"provider_citation_id" varchar(128),
	"source_name" varchar(150) NOT NULL,
	"retrieval_method" varchar(50) NOT NULL,
	"trust_tier" varchar(40) NOT NULL,
	"trust_basis" varchar(30) NOT NULL,
	"trust_reviewed_by_auth_user_id" uuid,
	"trust_reviewed_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_sha256" varchar(64),
	"fetch_status" varchar(20) NOT NULL,
	"snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_sources_retrieval_method_check" CHECK ("ai_sources"."retrieval_method" IN ('PROVIDER_GROUNDING', 'SEARCH_API', 'DIRECT_URL')),
	CONSTRAINT "ai_sources_trust_tier_check" CHECK ("ai_sources"."trust_tier" IN ('TIER_1_OFFICIAL_MANUFACTURER', 'TIER_2_OFFICIAL_MANUAL', 'TIER_3_OFFICIAL_MEDIA_KIT', 'TIER_4_AUTHORIZED_DISTRIBUTOR', 'TIER_5_REPUTABLE_SECONDARY', 'TIER_6_PUBLIC_SUPPORTING')),
	CONSTRAINT "ai_sources_trust_basis_check" CHECK ("ai_sources"."trust_basis" IN ('CANONICAL_BRAND_DOMAIN_MATCH', 'MANUAL_STAFF_VERIFIED', 'UNVERIFIED_DEFAULT')),
	CONSTRAINT "ai_sources_content_sha256_format" CHECK ("ai_sources"."content_sha256" IS NULL OR "ai_sources"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_sources_fetch_status_check" CHECK ("ai_sources"."fetch_status" IN ('SUCCESS', 'FAILED', 'FILTERED_UNTRUSTED')),
	CONSTRAINT "ai_sources_url_or_citation_check" CHECK ("ai_sources"."original_url" IS NOT NULL OR "ai_sources"."provider_citation_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ai_product_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_item_id" uuid NOT NULL,
	"brand_id" uuid,
	"category_id" uuid,
	"proposed_name" varchar(200) NOT NULL,
	"proposed_slug" varchar(200) NOT NULL,
	"proposed_subtitle" varchar(255),
	"proposed_description" text,
	"proposed_specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unmapped_specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposed_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_seo_draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"media_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"applied_product_id" uuid,
	"reviewed_by_auth_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_product_proposals_job_item_id_unique" UNIQUE("job_item_id"),
	CONSTRAINT "ai_product_proposals_status_check" CHECK ("ai_product_proposals"."status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED'))
);
--> statement-breakpoint
CREATE TABLE "ai_proposal_field_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"field_path" varchar(100) NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"selected_value" jsonb,
	"decision" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"verification_state" varchar(30) NOT NULL,
	"preferred_source_id" uuid,
	"conflict_details" jsonb,
	"reviewed_by_auth_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_proposal_field_reviews_proposal_field_unique" UNIQUE("proposal_id","field_path"),
	CONSTRAINT "ai_proposal_field_reviews_decision_check" CHECK ("ai_proposal_field_reviews"."decision" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'MANUALLY_EDITED')),
	CONSTRAINT "ai_proposal_field_reviews_verification_state_check" CHECK ("ai_proposal_field_reviews"."verification_state" IN ('VERIFIED_OFFICIAL', 'VERIFIED_SECONDARY', 'AI_INFERRED', 'SOURCE_CONFLICT', 'UNVERIFIED'))
);
--> statement-breakpoint
CREATE TABLE "ai_proposal_field_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"field_review_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"relationship" varchar(20) NOT NULL,
	"source_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_proposal_field_sources_review_source_rel_unique" UNIQUE("field_review_id","source_id","relationship"),
	CONSTRAINT "ai_proposal_field_sources_relationship_check" CHECK ("ai_proposal_field_sources"."relationship" IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT_ONLY'))
);
--> statement-breakpoint
CREATE TABLE "ai_proposal_apply_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"apply_operation_id" uuid NOT NULL,
	"apply_actor_auth_user_id" uuid NOT NULL,
	"step_key" varchar(50) NOT NULL,
	"step_ordinal" integer NOT NULL,
	"mutation_request_id" varchar(128) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"request_payload" jsonb NOT NULL,
	"step_status" varchar(20) DEFAULT 'PREPARED' NOT NULL,
	"target_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_proposal_apply_steps_proposal_step_unique" UNIQUE("proposal_id","step_key"),
	CONSTRAINT "ai_proposal_apply_steps_operation_step_unique" UNIQUE("apply_operation_id","step_key"),
	CONSTRAINT "ai_proposal_apply_steps_step_ordinal_non_negative" CHECK ("ai_proposal_apply_steps"."step_ordinal" >= 0),
	CONSTRAINT "ai_proposal_apply_steps_request_fingerprint_format" CHECK ("ai_proposal_apply_steps"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_proposal_apply_steps_step_status_check" CHECK ("ai_proposal_apply_steps"."step_status" IN ('PREPARED', 'IN_FLIGHT', 'COMMITTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'))
);
--> statement-breakpoint
CREATE TABLE "ai_provider_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_item_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"profile_id" uuid NOT NULL,
	"profile_key" varchar(50) NOT NULL,
	"temperature" numeric(3, 2) NOT NULL,
	"max_tokens" integer NOT NULL,
	"operation_type" varchar(50) NOT NULL,
	"attempt_ordinal" integer NOT NULL,
	"request_digest" varchar(64) NOT NULL,
	"provider_request_id" varchar(128),
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" varchar(20) NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint,
	"currency" varchar(3),
	"cost_source" varchar(20) NOT NULL,
	"pricing_version" varchar(50),
	"pricing_effective_at" timestamp with time zone,
	"provider_billing_reference" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_attempts_job_ordinal_op_unique" UNIQUE("job_item_id","attempt_ordinal","operation_type"),
	CONSTRAINT "ai_provider_attempts_operation_type_check" CHECK ("ai_provider_attempts"."operation_type" IN ('IDENTITY_RESOLUTION', 'SPEC_EXTRACTION', 'COPY_GENERATION')),
	CONSTRAINT "ai_provider_attempts_attempt_ordinal_positive" CHECK ("ai_provider_attempts"."attempt_ordinal" >= 1),
	CONSTRAINT "ai_provider_attempts_request_digest_format" CHECK ("ai_provider_attempts"."request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_provider_attempts_status_check" CHECK ("ai_provider_attempts"."status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'RATE_LIMITED', 'UNKNOWN')),
	CONSTRAINT "ai_provider_attempts_input_tokens_non_negative" CHECK ("ai_provider_attempts"."input_tokens" >= 0),
	CONSTRAINT "ai_provider_attempts_output_tokens_non_negative" CHECK ("ai_provider_attempts"."output_tokens" >= 0),
	CONSTRAINT "ai_provider_attempts_total_tokens_non_negative" CHECK ("ai_provider_attempts"."total_tokens" >= 0),
	CONSTRAINT "ai_provider_attempts_cost_micros_check" CHECK ("ai_provider_attempts"."cost_micros" IS NULL OR "ai_provider_attempts"."cost_micros" >= 0),
	CONSTRAINT "ai_provider_attempts_currency_format" CHECK ("ai_provider_attempts"."currency" IS NULL OR "ai_provider_attempts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ai_provider_attempts_cost_source_check" CHECK ("ai_provider_attempts"."cost_source" IN ('UNAVAILABLE', 'ESTIMATED', 'PROVIDER_REPORTED')),
	CONSTRAINT "ai_provider_attempts_cost_integrity_check" CHECK (("ai_provider_attempts"."cost_source" = 'UNAVAILABLE' AND "ai_provider_attempts"."cost_micros" IS NULL AND "ai_provider_attempts"."currency" IS NULL) OR ("ai_provider_attempts"."cost_source" IN ('ESTIMATED', 'PROVIDER_REPORTED') AND "ai_provider_attempts"."cost_micros" IS NOT NULL AND "ai_provider_attempts"."currency" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_profiles" ADD CONSTRAINT "ai_profiles_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_research_jobs" ADD CONSTRAINT "ai_research_jobs_selected_profile_id_ai_profiles_id_fk" FOREIGN KEY ("selected_profile_id") REFERENCES "public"."ai_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_research_jobs" ADD CONSTRAINT "ai_research_jobs_created_by_auth_user_id_users_id_fk" FOREIGN KEY ("created_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_research_job_items" ADD CONSTRAINT "ai_research_job_items_job_id_ai_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_research_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_research_job_items" ADD CONSTRAINT "ai_research_job_items_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sources" ADD CONSTRAINT "ai_sources_job_item_id_ai_research_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."ai_research_job_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sources" ADD CONSTRAINT "ai_sources_trust_reviewed_by_auth_user_id_users_id_fk" FOREIGN KEY ("trust_reviewed_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_product_proposals" ADD CONSTRAINT "ai_product_proposals_job_item_id_ai_research_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."ai_research_job_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_product_proposals" ADD CONSTRAINT "ai_product_proposals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_product_proposals" ADD CONSTRAINT "ai_product_proposals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_product_proposals" ADD CONSTRAINT "ai_product_proposals_applied_product_id_products_id_fk" FOREIGN KEY ("applied_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_product_proposals" ADD CONSTRAINT "ai_product_proposals_reviewed_by_auth_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_field_reviews" ADD CONSTRAINT "ai_proposal_field_reviews_proposal_id_ai_product_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_product_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_field_reviews" ADD CONSTRAINT "ai_proposal_field_reviews_preferred_source_id_ai_sources_id_fk" FOREIGN KEY ("preferred_source_id") REFERENCES "public"."ai_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_field_reviews" ADD CONSTRAINT "ai_proposal_field_reviews_reviewed_by_auth_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_field_sources" ADD CONSTRAINT "ai_proposal_field_sources_field_review_id_ai_proposal_field_reviews_id_fk" FOREIGN KEY ("field_review_id") REFERENCES "public"."ai_proposal_field_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_field_sources" ADD CONSTRAINT "ai_proposal_field_sources_source_id_ai_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_apply_steps" ADD CONSTRAINT "ai_proposal_apply_steps_proposal_id_ai_product_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_product_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_apply_steps" ADD CONSTRAINT "ai_proposal_apply_steps_apply_actor_auth_user_id_users_id_fk" FOREIGN KEY ("apply_actor_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_attempts" ADD CONSTRAINT "ai_provider_attempts_job_item_id_ai_research_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."ai_research_job_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_attempts" ADD CONSTRAINT "ai_provider_attempts_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_attempts" ADD CONSTRAINT "ai_provider_attempts_profile_id_ai_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."ai_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_credentials_active_idx" ON "ai_provider_credentials" USING btree ("provider_id") WHERE "ai_provider_credentials"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ai_research_jobs_dispatch_recon_idx" ON "ai_research_jobs" USING btree ("dispatch_status","updated_at") WHERE "ai_research_jobs"."dispatch_status" IN ('PENDING_DISPATCH', 'DISPATCH_FAILED');--> statement-breakpoint
CREATE INDEX "ai_research_job_items_job_status_idx" ON "ai_research_job_items" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "ai_research_job_items_lease_reclaim_idx" ON "ai_research_job_items" USING btree ("status","processing_lease_expires_at") WHERE "ai_research_job_items"."status" = 'RESEARCHING';--> statement-breakpoint
CREATE INDEX "ai_sources_job_item_idx" ON "ai_sources" USING btree ("job_item_id");--> statement-breakpoint
CREATE INDEX "ai_product_proposals_status_idx" ON "ai_product_proposals" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "ai_product_proposals_job_item_idx" ON "ai_product_proposals" USING btree ("job_item_id");--> statement-breakpoint
CREATE INDEX "ai_proposal_field_sources_review_idx" ON "ai_proposal_field_sources" USING btree ("field_review_id");--> statement-breakpoint
CREATE INDEX "ai_proposal_field_sources_source_idx" ON "ai_proposal_field_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "ai_proposal_apply_steps_proposal_step_idx" ON "ai_proposal_apply_steps" USING btree ("proposal_id","step_key");--> statement-breakpoint
CREATE INDEX "ai_proposal_apply_steps_op_step_idx" ON "ai_proposal_apply_steps" USING btree ("apply_operation_id","step_key");--> statement-breakpoint
CREATE INDEX "ai_provider_attempts_job_ordinal_idx" ON "ai_provider_attempts" USING btree ("job_item_id","operation_type","attempt_ordinal");--> statement-breakpoint
CREATE INDEX "ai_provider_attempts_status_idx" ON "ai_provider_attempts" USING btree ("status","started_at");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
  "public"."ai_providers",
  "public"."ai_provider_credentials",
  "public"."ai_profiles",
  "public"."ai_research_jobs",
  "public"."ai_research_job_items",
  "public"."ai_sources",
  "public"."ai_product_proposals",
  "public"."ai_proposal_field_reviews",
  "public"."ai_proposal_field_sources",
  "public"."ai_proposal_apply_steps",
  "public"."ai_provider_attempts"
FROM "anon", "authenticated", "service_role";