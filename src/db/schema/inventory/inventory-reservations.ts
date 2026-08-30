import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { orderItems } from "../orders/order-items";
import { orders } from "../orders/orders";
import { inventoryReservationStatusEnum } from "./enums";
import { inventoryItems } from "./inventory-items";

/**
 * Inventory Reservations Entity
 *
 * Temporary stock holds created during checkout or held during payment verification.
 *
 * Canonical Invariants:
 * 1. Inventory Item Restrict: inventory_item_id FK has ON DELETE RESTRICT.
 * 2. Order Restrict: order_id FK has ON DELETE RESTRICT (reservation audit records cannot be cascade-deleted).
 * 3. Order Item Restrict: order_item_id FK has ON DELETE RESTRICT.
 * 4. Quantity: quantity > 0.
 * 5. Non-Terminal Uniqueness: At most one non-terminal reservation (ACTIVE, VERIFICATION_HOLD, ALLOCATED) per order_item_id.
 */
export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references((): AnyPgColumn => inventoryItems.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references((): AnyPgColumn => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    status: inventoryReservationStatusEnum("status").notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check("inventory_reservations_quantity_positive", sql`${table.quantity} > 0`),
    uniqueIndex("inventory_reservations_order_item_non_terminal_unique")
      .on(table.orderItemId)
      .where(sql`${table.status} IN ('ACTIVE', 'VERIFICATION_HOLD', 'ALLOCATED')`),
    index("inventory_reservations_order_id_idx").on(table.orderId),
    index("inventory_reservations_inventory_item_id_idx").on(table.inventoryItemId),
    index("inventory_reservations_status_expires_at_idx").on(table.status, table.expiresAt),
  ]
);

export type InventoryReservation = typeof inventoryReservations.$inferSelect;
export type NewInventoryReservation = typeof inventoryReservations.$inferInsert;
