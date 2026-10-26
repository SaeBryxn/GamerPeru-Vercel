CREATE TABLE "home_section_products" (
	"section_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "home_section_products_section_id_product_id_pk" PRIMARY KEY("section_id","product_id"),
	CONSTRAINT "home_section_products_order_unique" UNIQUE("section_id","display_order"),
	CONSTRAINT "home_section_products_order_check" CHECK ("home_section_products"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "home_section_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storefront_menu_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"href" varchar(500) NOT NULL,
	"section_title" varchar(100) DEFAULT 'Enlaces' NOT NULL,
	"placement" varchar(16) DEFAULT 'section' NOT NULL,
	"icon" varchar(16),
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_menu_links_order_check" CHECK ("storefront_menu_links"."display_order" >= 0),
	CONSTRAINT "storefront_menu_links_placement_check" CHECK ("storefront_menu_links"."placement" IN ('section', 'tile'))
);
--> statement-breakpoint
ALTER TABLE "storefront_menu_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storefront_menu_products" (
	"entry_id" varchar(64) NOT NULL,
	"product_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "storefront_menu_products_entry_id_product_id_pk" PRIMARY KEY("entry_id","product_id"),
	CONSTRAINT "storefront_menu_products_order_unique" UNIQUE("entry_id","display_order"),
	CONSTRAINT "storefront_menu_products_order_check" CHECK ("storefront_menu_products"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "storefront_menu_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "storefront_menu_entries" ADD COLUMN "label" varchar(100);--> statement-breakpoint
ALTER TABLE "storefront_menu_entries" ADD COLUMN "href" varchar(500);--> statement-breakpoint
ALTER TABLE "storefront_menu_entries" ADD COLUMN "links_configured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "home_section_products" ADD CONSTRAINT "home_section_products_section_id_home_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."home_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_section_products" ADD CONSTRAINT "home_section_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_menu_links" ADD CONSTRAINT "storefront_menu_links_entry_id_storefront_menu_entries_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."storefront_menu_entries"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_menu_products" ADD CONSTRAINT "storefront_menu_products_entry_id_storefront_menu_entries_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."storefront_menu_entries"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_menu_products" ADD CONSTRAINT "storefront_menu_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_section_products_product_idx" ON "home_section_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "storefront_menu_links_order_idx" ON "storefront_menu_links" USING btree ("entry_id","display_order");--> statement-breakpoint
CREATE INDEX "storefront_menu_products_product_idx" ON "storefront_menu_products" USING btree ("product_id");
--> statement-breakpoint
-- Preserve every existing manual selection while replacing slugs with foreign keys.
INSERT INTO "home_section_products" ("section_id", "product_id", "display_order")
SELECT h.id, p.id, (chosen.position - 1)::integer
FROM home_sections h
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(h.content #> '{selection,productSlugs}') = 'array'
       THEN h.content #> '{selection,productSlugs}' ELSE '[]'::jsonb END
) WITH ORDINALITY AS chosen(slug, position)
JOIN products p ON p.slug = chosen.slug
WHERE h.section_type IN ('product_carousel', 'catalog_rail') AND h.content #>> '{selection,mode}' = 'manual'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "storefront_menu_products" ("entry_id", "product_id", "display_order")
SELECT m.entry_id, p.id, (chosen.position - 1)::integer
FROM storefront_menu_entries m
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(m.product_selection -> 'productSlugs') = 'array'
       THEN m.product_selection -> 'productSlugs' ELSE '[]'::jsonb END
) WITH ORDINALITY AS chosen(slug, position)
JOIN products p ON p.slug = chosen.slug
WHERE m.product_selection ->> 'mode' = 'manual'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE home_sections SET content = jsonb_set(content, '{selection,productSlugs}', '[]'::jsonb)
WHERE section_type IN ('product_carousel', 'catalog_rail') AND jsonb_typeof(content -> 'selection') = 'object';
--> statement-breakpoint
UPDATE storefront_menu_entries SET product_selection = jsonb_set(product_selection, '{productSlugs}', '[]'::jsonb)
WHERE jsonb_typeof(product_selection) = 'object';
--> statement-breakpoint
-- Only the authorized server writes editorial content, never the public Data API.
REVOKE ALL ON TABLE "home_section_products", "storefront_menu_products", "storefront_menu_links" FROM anon, authenticated;
ALTER TABLE "home_section_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_menu_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_menu_links" ENABLE ROW LEVEL SECURITY;
