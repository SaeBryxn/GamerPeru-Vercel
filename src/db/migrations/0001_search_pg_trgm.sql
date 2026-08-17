CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING gin ("name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "categories_name_trgm_idx" ON "categories" USING gin ("name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_subtitle_trgm_idx" ON "products" USING gin ("subtitle" extensions.gin_trgm_ops);