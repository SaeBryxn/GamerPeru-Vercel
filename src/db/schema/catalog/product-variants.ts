import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { variantStatusEnum } from "../enums";
import { products } from "./products";

/**
 * Product Variants Entity
 *
 * Represents the canonical sellable SKU (e.g., "Beast X - Black / Omron Optical Switches").
 * Inventory, prices, and line items attach strictly to ProductVariant.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 50 }).notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    priceCents: integer("price_cents").notNull(),
    compareAtPriceCents: integer("compare_at_price_cents"),
    costCents: integer("cost_cents"),
    weightGrams: integer("weight_grams"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    status: variantStatusEnum("status").notNull().default("ACTIVE"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("product_variants_sku_idx").on(table.sku),
    index("product_variants_product_id_status_idx").on(table.productId, table.status),
    check("product_variants_price_positive", sql`${table.priceCents} > 0`),
    check(
      "product_variants_compare_at_non_negative",
      sql`${table.compareAtPriceCents} IS NULL OR ${table.compareAtPriceCents} >= 0`
    ),
    check(
      "product_variants_cost_non_negative",
      sql`${table.costCents} IS NULL OR ${table.costCents} >= 0`
    ),
    check(
      "product_variants_weight_positive",
      sql`${table.weightGrams} IS NULL OR ${table.weightGrams} > 0`
    ),
    check("product_variants_display_order_non_negative", sql`${table.displayOrder} >= 0`),
  ]
);

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
