import {
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
import { inventoryMovementTypeEnum, inventoryReferenceTypeEnum } from "./enums";
import { inventoryItems } from "./inventory-items";

/**
 * Inventory Ledger Entries Entity
 *
 * Immutable append-only audit ledger tracking every stock transition with multi-balance deltas.
 *
 * Canonical Invariants:
 * 1. Inventory Item Restrict: inventory_item_id FK has ON DELETE RESTRICT (ledger history cannot be deleted).
 * 2. Immutable: Append-only transaction log.
 * 3. Supports Checkout: Supports 'RESERVATION_CREATED' with reserved_delta = +qty.
 */
export const inventoryLedgerEntries = pgTable(
  "inventory_ledger_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references((): AnyPgColumn => inventoryItems.id, { onDelete: "restrict" }),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    onHandDelta: integer("on_hand_delta").notNull().default(0),
    reservedDelta: integer("reserved_delta").notNull().default(0),
    allocatedDelta: integer("allocated_delta").notNull().default(0),
    quantityOnHandAfter: integer("quantity_on_hand_after").notNull(),
    quantityReservedAfter: integer("quantity_reserved_after").notNull(),
    quantityAllocatedAfter: integer("quantity_allocated_after").notNull(),
    referenceType: inventoryReferenceTypeEnum("reference_type").notNull(),
    referenceId: varchar("reference_id", { length: 255 }).notNull(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_ledger_entries_inventory_item_id_idx").on(table.inventoryItemId),
    index("inventory_ledger_entries_reference_idx").on(table.referenceType, table.referenceId),
    index("inventory_ledger_entries_created_at_idx").on(table.createdAt),
  ]
);

export type InventoryLedgerEntry = typeof inventoryLedgerEntries.$inferSelect;
export type NewInventoryLedgerEntry = typeof inventoryLedgerEntries.$inferInsert;
