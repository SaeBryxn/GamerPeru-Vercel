CREATE TYPE "public"."media_upload_status" AS ENUM('PENDING', 'READY', 'ABORTED', 'EXPIRED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "media_storage_budget" (
	"id" smallint PRIMARY KEY NOT NULL,
	"budget_bytes" bigint NOT NULL,
	"used_bytes" bigint NOT NULL,
	"reserved_bytes" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_budget_singleton" CHECK ("media_storage_budget"."id" = 1),
	CONSTRAINT "media_storage_budget_nonnegative" CHECK ("media_storage_budget"."budget_bytes" >= 0 AND "media_storage_budget"."used_bytes" >= 0 AND "media_storage_budget"."reserved_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_storage_budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_auth_user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"subject_id" uuid,
	"variant_id" uuid,
	"object_key" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"declared_size_bytes" integer NOT NULL,
	"status" "media_upload_status" DEFAULT 'PENDING' NOT NULL,
	"media_asset_id" uuid,
	"width" integer,
	"height" integer,
	"failure_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "media_uploads_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "media_upload_size_positive" CHECK ("media_uploads"."declared_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_uploads_expiration_idx" ON "media_uploads" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "media_uploads_actor_created_idx" ON "media_uploads" USING btree ("actor_auth_user_id","created_at");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."media_uploads", "public"."media_storage_budget" FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
INSERT INTO "media_storage_budget" ("id", "budget_bytes", "used_bytes", "reserved_bytes")
SELECT 1, 8589934592, COALESCE(SUM("file_size_bytes"), 0), 0
FROM "media_assets" WHERE "security_class" = 'PUBLIC_MEDIA';
