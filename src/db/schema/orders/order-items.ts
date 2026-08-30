import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { productVariants } from "../catalog/product-variants";
import { orders } from "./orders";

/**
 * Order Items Entity
 *
 * Immutable purchase-time line facts.
 *
 * Canonical Invariants:
 * 1. Order Restrict: order_id FK has ON DELETE RESTRICT (financial history cannot be cascade-deleted).
 * 2. Variant Restrict: variant_id FK has ON DELETE RESTRICT (preserves catalog history).
 * 3. Quantity: quantity > 0.
 * 4. Line Total Arithmetic: line_total_cents = quantity * unit_price_cents_snapshot.
 * 5. Immutable Snapshots: SKU, product name, variant title, and unit price captured at purchase.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references((): AnyPgColumn => productVariants.id, { onDelete: "restrict" }),
    skuSnapshot: varchar("sku_snapshot", { length: 50 }).notNull(),
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),
    variantTitleSnapshot: varchar("variant_title_snapshot", { length: 150 }).notNull(),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${table.unitPriceCentsSnapshot} >= 0`),
    check(
      "order_items_line_total_arithmetic",
      sql`${table.lineTotalCents} = ${table.quantity} * ${table.unitPriceCentsSnapshot}`
    ),
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_variant_id_idx").on(table.variantId),
  ]
);

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
