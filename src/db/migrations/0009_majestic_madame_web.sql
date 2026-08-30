CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'EXPIRED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('UNFULFILLED', 'READY_TO_PACK', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('MANUAL', 'GATEWAY');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'SUBMITTED', 'VERIFYING', 'PAID', 'REJECTED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."idempotency_operation_type" AS ENUM('ORDER_CREATION', 'PAYMENT_SUBMISSION', 'PAYMENT_VERIFICATION_APPROVE', 'PAYMENT_VERIFICATION_REJECT', 'ORDER_CANCELLATION', 'REFUND_RECORDING', 'INVENTORY_MUTATION', 'AFFILIATE_CONVERSION_QUALIFY', 'COMMISSION_PAYOUT_BATCH', 'OUTBOX_DISPATCH');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('RECEIVING', 'MANUAL_ADJUSTMENT', 'RESERVATION_CREATED', 'RESERVATION_EXPIRED', 'RESERVATION_RELEASED', 'ALLOCATION_CONFIRMED', 'ALLOCATION_RELEASED', 'FULFILLMENT_DISPATCHED', 'RETURN_RESTOCKED');--> statement-breakpoint
CREATE TYPE "public"."inventory_reference_type" AS ENUM('ORDER', 'PURCHASE_ORDER', 'RMA', 'MANUAL_AUDIT');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('ACTIVE', 'VERIFICATION_HOLD', 'ALLOCATED', 'CONSUMED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"customer_id" uuid,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"customer_notes" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_subtotal_cents_non_negative" CHECK ("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_discount_cents_non_negative" CHECK ("orders"."discount_cents" >= 0),
	CONSTRAINT "orders_shipping_cents_non_negative" CHECK ("orders"."shipping_cents" >= 0),
	CONSTRAINT "orders_total_cents_non_negative" CHECK ("orders"."total_cents" >= 0),
	CONSTRAINT "orders_pricing_arithmetic_check" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" - "orders"."discount_cents" + "orders"."shipping_cents")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku_snapshot" varchar(50) NOT NULL,
	"product_name_snapshot" varchar(200) NOT NULL,
	"variant_title_snapshot" varchar(150) NOT NULL,
	"unit_price_cents_snapshot" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_non_negative" CHECK ("order_items"."unit_price_cents_snapshot" >= 0),
	CONSTRAINT "order_items_line_total_arithmetic" CHECK ("order_items"."line_total_cents" = "order_items"."quantity" * "order_items"."unit_price_cents_snapshot")
);
--> statement-breakpoint
CREATE TABLE "order_address_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
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
	CONSTRAINT "order_address_snapshots_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "order_pricing_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_pricing_snapshots_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "order_pricing_snapshots_subtotal_non_negative" CHECK ("order_pricing_snapshots"."subtotal_cents" >= 0),
	CONSTRAINT "order_pricing_snapshots_discount_non_negative" CHECK ("order_pricing_snapshots"."discount_cents" >= 0),
	CONSTRAINT "order_pricing_snapshots_shipping_non_negative" CHECK ("order_pricing_snapshots"."shipping_cents" >= 0),
	CONSTRAINT "order_pricing_snapshots_total_non_negative" CHECK ("order_pricing_snapshots"."total_cents" >= 0),
	CONSTRAINT "order_pricing_snapshots_arithmetic_check" CHECK ("order_pricing_snapshots"."total_cents" = "order_pricing_snapshots"."subtotal_cents" - "order_pricing_snapshots"."discount_cents" + "order_pricing_snapshots"."shipping_cents")
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"base_price_cents" integer NOT NULL,
	"estimated_days_min" integer,
	"estimated_days_max" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_unique" UNIQUE("code"),
	CONSTRAINT "shipping_methods_base_price_non_negative" CHECK ("shipping_methods"."base_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"shipping_method_id" uuid NOT NULL,
	"status" "shipment_status" DEFAULT 'UNFULFILLED' NOT NULL,
	"courier_name" varchar(100),
	"tracking_number" varchar(100),
	"tracking_url" varchar(500),
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_method_configurations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"method_type" "payment_method_type" DEFAULT 'MANUAL' NOT NULL,
	"current_instruction_version_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_method_configurations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_instruction_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_method_code" varchar(50) NOT NULL,
	"version_number" integer NOT NULL,
	"recipient_name" varchar(150) NOT NULL,
	"account_identifier" varchar(50) NOT NULL,
	"qr_media_id" uuid,
	"instruction_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_instruction_versions_method_version_unique" UNIQUE("payment_method_code","version_number"),
	CONSTRAINT "payment_instruction_versions_id_method_code_unique" UNIQUE("id","payment_method_code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_method_code" varchar(50) NOT NULL,
	"instruction_version_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"resubmission_grace_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payments_amount_cents_non_negative" CHECK ("payments"."amount_cents" >= 0),
	CONSTRAINT "payments_refunded_amount_non_negative" CHECK ("payments"."refunded_amount_cents" >= 0),
	CONSTRAINT "payments_refunded_amount_lte_total" CHECK ("payments"."refunded_amount_cents" <= "payments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"operation_type" "idempotency_operation_type" NOT NULL,
	"authority_binding_digest" varchar(64) NOT NULL,
	"source_cart_id" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"target_aggregate_id" varchar(255),
	"response_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"quantity_allocated" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_variant_location_unique" UNIQUE("variant_id","location_id"),
	CONSTRAINT "inventory_items_quantity_on_hand_non_negative" CHECK ("inventory_items"."quantity_on_hand" >= 0),
	CONSTRAINT "inventory_items_quantity_reserved_non_negative" CHECK ("inventory_items"."quantity_reserved" >= 0),
	CONSTRAINT "inventory_items_quantity_allocated_non_negative" CHECK ("inventory_items"."quantity_allocated" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "inventory_reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"on_hand_delta" integer DEFAULT 0 NOT NULL,
	"reserved_delta" integer DEFAULT 0 NOT NULL,
	"allocated_delta" integer DEFAULT 0 NOT NULL,
	"quantity_on_hand_after" integer NOT NULL,
	"quantity_reserved_after" integer NOT NULL,
	"quantity_allocated_after" integer NOT NULL,
	"reference_type" "inventory_reference_type" NOT NULL,
	"reference_id" varchar(255) NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_name" varchar(100) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" varchar(50) NOT NULL,
	"aggregate_id" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_address_snapshots" ADD CONSTRAINT "order_address_snapshots_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_pricing_snapshots" ADD CONSTRAINT "order_pricing_snapshots_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_configurations" ADD CONSTRAINT "payment_method_configurations_current_instruction_fk" FOREIGN KEY ("current_instruction_version_id","code") REFERENCES "public"."payment_instruction_versions"("id","payment_method_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instruction_versions" ADD CONSTRAINT "payment_instruction_versions_payment_method_code_payment_method_configurations_code_fk" FOREIGN KEY ("payment_method_code") REFERENCES "public"."payment_method_configurations"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instruction_versions" ADD CONSTRAINT "payment_instruction_versions_qr_media_id_media_assets_id_fk" FOREIGN KEY ("qr_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_code_payment_method_configurations_code_fk" FOREIGN KEY ("payment_method_code") REFERENCES "public"."payment_method_configurations"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_instruction_method_fk" FOREIGN KEY ("instruction_version_id","payment_method_code") REFERENCES "public"."payment_instruction_versions"("id","payment_method_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_source_cart_id_carts_id_fk" FOREIGN KEY ("source_cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "shipments_order_id_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_instruction_versions_method_code_idx" ON "payment_instruction_versions" USING btree ("payment_method_code");--> statement-breakpoint
CREATE INDEX "payments_status_created_at_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_source_cart_id_idx" ON "idempotency_keys" USING btree ("source_cart_id");--> statement-breakpoint
CREATE INDEX "inventory_items_variant_id_idx" ON "inventory_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_items_location_id_idx" ON "inventory_items" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_order_item_non_terminal_unique" ON "inventory_reservations" USING btree ("order_item_id") WHERE "inventory_reservations"."status" IN ('ACTIVE', 'VERIFICATION_HOLD', 'ALLOCATED');--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_inventory_item_id_idx" ON "inventory_reservations" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "inventory_ledger_entries_inventory_item_id_idx" ON "inventory_ledger_entries" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_entries_reference_idx" ON "inventory_ledger_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_entries_created_at_idx" ON "inventory_ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_next_attempt_idx" ON "outbox_events" USING btree ("status","next_attempt_at");