import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { customerProfiles } from "../identity/customer-profiles";
import { orderStatusEnum } from "./enums";

/**
 * Orders Entity
 *
 * The central operational entity representing a committed purchase.
 *
 * Canonical Invariants:
 * 1. Customer Nullability: customer_id is nullable for guest purchases; references CustomerProfile.id when authenticated.
 * 2. Order Number: Public, unique, non-sequential unguessable reference (e.g. GP-7K9M2026).
 * 3. Initial Status: Default 'PENDING'.
 * 4. Money: All monetary values in integer minor units (PEN cents, non-negative).
 * 5. Arithmetic Consistency: total_cents = subtotal_cents - discount_cents + shipping_cents.
 * 6. Historical Safety: customer_id FK has ON DELETE SET NULL to preserve financial history.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderNumber: varchar("order_number", { length: 30 }).notNull().unique(),
    customerId: uuid("customer_id").references((): AnyPgColumn => customerProfiles.id, {
      onDelete: "set null",
    }),
    customerEmail: varchar("customer_email", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
    status: orderStatusEnum("status").notNull().default("PENDING"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
    customerNotes: text("customer_notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: varchar("cancel_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check("orders_subtotal_cents_non_negative", sql`${table.subtotalCents} >= 0`),
    check("orders_discount_cents_non_negative", sql`${table.discountCents} >= 0`),
    check("orders_shipping_cents_non_negative", sql`${table.shippingCents} >= 0`),
    check("orders_total_cents_non_negative", sql`${table.totalCents} >= 0`),
    check(
      "orders_pricing_arithmetic_check",
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents} + ${table.shippingCents}`
    ),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_status_created_at_idx").on(table.status, table.createdAt),
    index("orders_created_id_idx").on(table.createdAt.desc(), table.id.desc()),
    index("orders_lower_email_created_id_idx").on(
      sql`lower(${table.customerEmail})`,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
