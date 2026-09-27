CREATE TABLE "order_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"author_auth_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mutation_request_id" uuid NOT NULL,
	"intent_fingerprint" char(64) NOT NULL,
	"actor_binding_digest" char(64) NOT NULL,
	CONSTRAINT "order_notes_mutation_request_id_unique" UNIQUE("mutation_request_id"),
	CONSTRAINT "order_notes_body_not_blank" CHECK (length(trim("order_notes"."body")) > 0),
	CONSTRAINT "order_notes_body_max_length" CHECK (char_length("order_notes"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_author_auth_user_id_fk" FOREIGN KEY ("author_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_notes_order_created_id_idx" ON "order_notes" USING btree ("order_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_created_id_idx" ON "orders" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_lower_email_created_id_idx" ON "orders" USING btree (lower("customer_email"),"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);