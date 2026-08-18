CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"variant_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_media_display_order_check" CHECK ("product_media"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_stories" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"published_revision_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_story_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" "catalog_status" DEFAULT 'DRAFT' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_auth_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_story_revisions_product_revision_unique" UNIQUE("product_id","revision_number"),
	CONSTRAINT "product_story_revisions_revision_positive" CHECK ("product_story_revisions"."revision_number" > 0),
	CONSTRAINT "product_story_revisions_blocks_array" CHECK (jsonb_typeof("product_story_revisions"."blocks") = 'array'),
	CONSTRAINT "product_story_revisions_published_at_check" CHECK ("product_story_revisions"."status" != 'PUBLISHED' OR "product_story_revisions"."published_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_published_revision_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."product_story_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_story_revisions" ADD CONSTRAINT "product_story_revisions_created_by_auth_user_id_users_id_fk" FOREIGN KEY ("created_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_story_revisions" ADD CONSTRAINT "product_story_revisions_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id","display_order");--> statement-breakpoint
CREATE INDEX "product_media_variant_idx" ON "product_media" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "product_story_revisions_product_status_idx" ON "product_story_revisions" USING btree ("product_id","status");