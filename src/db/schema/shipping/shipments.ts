import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { orders } from "../orders/orders";
import { shipmentStatusEnum } from "./enums";
import { shippingMethods } from "./shipping-methods";

/**
 * Shipments Entity
 *
 * Outbound delivery packages associated with Orders.
 *
 * Canonical Invariants:
 * 1. Order Cascade: order_id FK has ON DELETE CASCADE.
 * 2. Shipping Method Restrict: shipping_method_id FK has ON DELETE RESTRICT.
 * 3. Initial Status: Default 'UNFULFILLED'.
 * 4. Extensibility: Schema supports Order 1 -> * Shipment for future split fulfillment.
 */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: "cascade" }),
    shippingMethodId: uuid("shipping_method_id")
      .notNull()
      .references((): AnyPgColumn => shippingMethods.id, { onDelete: "restrict" }),
    status: shipmentStatusEnum("status").notNull().default("UNFULFILLED"),
    courierName: varchar("courier_name", { length: 100 }),
    trackingNumber: varchar("tracking_number", { length: 100 }),
    trackingUrl: varchar("tracking_url", { length: 500 }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("shipments_order_id_idx").on(table.orderId),
    index("shipments_status_idx").on(table.status),
  ]
);

export type Shipment = typeof shipments.$inferSelect;
export type NewShipment = typeof shipments.$inferInsert;
