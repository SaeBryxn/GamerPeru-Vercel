CREATE TYPE "public"."review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_item_id" uuid,
	"rating" smallint NOT NULL,
	"title" varchar(120),
	"body" text NOT NULL,
	"author_name" varchar(80) NOT NULL,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_reviews_customer_product_unique" UNIQUE("customer_id","product_id"),
	CONSTRAINT "product_reviews_rating_range" CHECK ("product_reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "product_reviews_body_length" CHECK (char_length("product_reviews"."body") BETWEEN 10 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_reviews_product_status_created_idx" ON "product_reviews" USING btree ("product_id","status","created_at");--> statement-breakpoint
CREATE INDEX "product_reviews_status_created_idx" ON "product_reviews" USING btree ("status","created_at");--> statement-breakpoint
-- Customer-written data, moderated before it is public: keep it out of the Supabase Data API. The app reads it server-side as the table owner.
ALTER TABLE "product_reviews" ENABLE ROW LEVEL SECURITY;
