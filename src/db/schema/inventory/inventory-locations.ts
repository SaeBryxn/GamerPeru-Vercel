import { boolean, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";

/**
 * Inventory Locations Entity
 *
 * Physical warehouses or fulfillment centers holding stock.
 *
 * Canonical Invariants:
 * 1. Code Uniqueness: code is UNIQUE NOT NULL (e.g. 'LOC-LIM-01').
 * 2. Structure Only: Zero invented production warehouse rows seeded by migration.
 */
export const inventoryLocations = pgTable("inventory_locations", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => generateUuidV7()),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryLocation = typeof inventoryLocations.$inferSelect;
export type NewInventoryLocation = typeof inventoryLocations.$inferInsert;
