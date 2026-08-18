CREATE TABLE "category_specification_schemas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"field_definitions" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_spec_schemas_category_id_schema_version_key" UNIQUE("category_id","schema_version"),
	CONSTRAINT "category_spec_schemas_version_positive" CHECK ("category_specification_schemas"."schema_version" > 0),
	CONSTRAINT "category_spec_schemas_field_defs_array" CHECK (jsonb_typeof("category_specification_schemas"."field_definitions") = 'array')
);
--> statement-breakpoint
CREATE TABLE "product_specifications" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"schema_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"spec_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_specifications_version_positive" CHECK ("product_specifications"."schema_version" > 0),
	CONSTRAINT "product_specifications_spec_values_object" CHECK (jsonb_typeof("product_specifications"."spec_values") = 'object')
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "current_spec_schema_id" uuid;--> statement-breakpoint
ALTER TABLE "category_specification_schemas" ADD CONSTRAINT "category_specification_schemas_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_schema_id_category_specification_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."category_specification_schemas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_spec_schemas_category_idx" ON "category_specification_schemas" USING btree ("category_id","is_active");--> statement-breakpoint
CREATE INDEX "product_specifications_schema_id_idx" ON "product_specifications" USING btree ("schema_id");--> statement-breakpoint
CREATE INDEX "product_specifications_spec_values_gin_idx" ON "product_specifications" USING gin ("spec_values" jsonb_path_ops);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_current_spec_schema_id_category_specification_schemas_id_fk" FOREIGN KEY ("current_spec_schema_id") REFERENCES "public"."category_specification_schemas"("id") ON DELETE set null ON UPDATE no action;