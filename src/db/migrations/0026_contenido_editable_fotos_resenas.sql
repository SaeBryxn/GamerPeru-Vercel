ALTER TYPE "public"."home_section_type" ADD VALUE 'brand_strip';--> statement-breakpoint
ALTER TABLE "product_reviews" ADD COLUMN "photo_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_menu_entries" ADD COLUMN "product_selection" jsonb;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_photo_limit" CHECK (jsonb_typeof("product_reviews"."photo_asset_ids") = 'array' AND jsonb_array_length("product_reviews"."photo_asset_ids") <= 3);
--> statement-breakpoint
ALTER TABLE "product_reviews" ENABLE ROW LEVEL SECURITY;
