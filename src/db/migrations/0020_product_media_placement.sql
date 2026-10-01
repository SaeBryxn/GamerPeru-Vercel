CREATE TYPE "public"."product_media_placement" AS ENUM('GALLERY', 'STORY');--> statement-breakpoint
ALTER TABLE "product_media" ADD COLUMN "placement" "product_media_placement" DEFAULT 'GALLERY' NOT NULL;--> statement-breakpoint
CREATE INDEX "product_media_product_placement_idx" ON "product_media" USING btree ("product_id","placement");