CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"recipient_name" varchar(150) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"street_address" varchar(255) NOT NULL,
	"apartment_suite" varchar(100),
	"department" varchar(100) NOT NULL,
	"province" varchar(100) NOT NULL,
	"district" varchar(100) NOT NULL,
	"postal_code" varchar(20),
	"reference_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_customer_id_id_unique" UNIQUE("customer_id","id")
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "default_shipping_address_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_shipping_address_fk" FOREIGN KEY ("id","default_shipping_address_id") REFERENCES "public"."customer_addresses"("customer_id","id") ON DELETE no action ON UPDATE no action;