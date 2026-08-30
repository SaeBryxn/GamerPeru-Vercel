import { pgTable, text, timestamp, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { orders } from "./orders";

/**
 * Order Address Snapshots Entity
 *
 * Immutable snapshot of the Peru delivery address frozen at checkout time.
 *
 * Canonical Invariants:
 * 1. Order Cascade: order_id FK has ON DELETE CASCADE.
 * 2. Uniqueness: UNIQUE(order_id) — exactly one delivery address snapshot per Order.
 * 3. Immutable: Stored as raw frozen values, independent of future CustomerAddress edits/deletions.
 */
export const orderAddressSnapshots = pgTable("order_address_snapshots", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => generateUuidV7()),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references((): AnyPgColumn => orders.id, { onDelete: "cascade" }),
  recipientName: varchar("recipient_name", { length: 150 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  streetAddress: varchar("street_address", { length: 255 }).notNull(),
  apartmentSuite: varchar("apartment_suite", { length: 100 }),
  department: varchar("department", { length: 100 }).notNull(),
  province: varchar("province", { length: 100 }).notNull(),
  district: varchar("district", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 20 }),
  referenceNotes: text("reference_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderAddressSnapshot = typeof orderAddressSnapshots.$inferSelect;
export type NewOrderAddressSnapshot = typeof orderAddressSnapshots.$inferInsert;
