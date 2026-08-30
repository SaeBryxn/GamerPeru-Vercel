import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { orders } from "./orders";

/**
 * Order Pricing Snapshots Entity
 *
 * Immutable financial breakdown frozen at checkout time.
 *
 * Canonical Invariants:
 * 1. Order Cascade: order_id FK has ON DELETE CASCADE.
 * 2. Uniqueness: UNIQUE(order_id) — exactly one pricing snapshot per Order.
 * 3. Money: Integer minor units in PEN cents, non-negative.
 * 4. Arithmetic Check: total_cents = subtotal_cents - discount_cents + shipping_cents.
 */
export const orderPricingSnapshots = pgTable(
  "order_pricing_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => orders.id, { onDelete: "cascade" }),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("order_pricing_snapshots_subtotal_non_negative", sql`${table.subtotalCents} >= 0`),
    check("order_pricing_snapshots_discount_non_negative", sql`${table.discountCents} >= 0`),
    check("order_pricing_snapshots_shipping_non_negative", sql`${table.shippingCents} >= 0`),
    check("order_pricing_snapshots_total_non_negative", sql`${table.totalCents} >= 0`),
    check(
      "order_pricing_snapshots_arithmetic_check",
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents} + ${table.shippingCents}`
    ),
  ]
);

export type OrderPricingSnapshot = typeof orderPricingSnapshots.$inferSelect;
export type NewOrderPricingSnapshot = typeof orderPricingSnapshots.$inferInsert;
