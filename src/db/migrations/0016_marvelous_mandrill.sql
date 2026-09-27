CREATE TABLE "storefront_menu_entries" (
	"entry_id" varchar(64) PRIMARY KEY NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
