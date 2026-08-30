import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { productVariants } from "../catalog/product-variants";
import { inventoryLocations } from "./inventory-locations";

/**
 * Inventory Items Entity
 *
 * Authoritative stock balances for a variant at a specific location.
 *
 * Canonical Invariants:
 * 1. Variant Uniqueness: UNIQUE(variant_id, location_id).
 * 2. Variant Restrict: variant_id FK has ON DELETE RESTRICT.
 * 3. Location Restrict: location_id FK has ON DELETE RESTRICT.
 * 4. Balance Checks: quantity_on_hand >= 0, quantity_reserved >= 0, quantity_allocated >= 0.
 * 5. Available to Sell Formula: available_to_sell = quantity_on_hand - quantity_reserved - quantity_allocated.
 */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    variantId: uuid("variant_id")
      .notNull()
      .references((): AnyPgColumn => productVariants.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references((): AnyPgColumn => inventoryLocations.id, { onDelete: "restrict" }),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    quantityAllocated: integer("quantity_allocated").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("inventory_items_variant_location_unique").on(table.variantId, table.locationId),
    check("inventory_items_quantity_on_hand_non_negative", sql`${table.quantityOnHand} >= 0`),
    check("inventory_items_quantity_reserved_non_negative", sql`${table.quantityReserved} >= 0`),
    check("inventory_items_quantity_allocated_non_negative", sql`${table.quantityAllocated} >= 0`),
    index("inventory_items_variant_id_idx").on(table.variantId),
    index("inventory_items_location_id_idx").on(table.locationId),
  ]
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
