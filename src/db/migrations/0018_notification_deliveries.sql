CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"template" varchar(64) NOT NULL,
	"channel" varchar(16) DEFAULT 'EMAIL' NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_message_id" varchar(255),
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_event_template_unique" UNIQUE("outbox_event_id","template")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_sent_at_idx" ON "notification_deliveries" USING btree ("sent_at");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."notification_deliveries" FROM "anon", "authenticated", "service_role";
