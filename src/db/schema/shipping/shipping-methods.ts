import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * Shipping Methods Entity
 *
 * Configurable delivery options supported by the store.
 *
 * Canonical Invariants:
 * 1. Code Uniqueness: code is UNIQUE NOT NULL (e.g. 'LIMA_EXPRESS', 'LIMA_REGULAR').
 * 2. Money: base_price_cents in integer minor units (PEN cents, non-negative).
 * 3. Structure Only: Zero hardcoded production rates seeded by migration.
 */
export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    basePriceCents: integer("base_price_cents").notNull(),
    estimatedDaysMin: integer("estimated_days_min"),
    estimatedDaysMax: integer("estimated_days_max"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("shipping_methods_base_price_non_negative", sql`${table.basePriceCents} >= 0`)]
);

export type ShippingMethod = typeof shippingMethods.$inferSelect;
export type NewShippingMethod = typeof shippingMethods.$inferInsert;
