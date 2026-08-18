import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaAssets } from "./media-assets";
import { productVariants } from "./product-variants";
import { products } from "./products";

/**
 * Product Media Entity
 *
 * Maps ordered PDP gallery media assets to a Product, with optional
 * association to a specific ProductVariant SKU.
 */
export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "cascade",
    }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_media_product_idx").on(table.productId, table.displayOrder.asc()),
    index("product_media_variant_idx").on(table.variantId),
    check("product_media_display_order_check", sql`${table.displayOrder} >= 0`),
  ]
);

export type ProductMedia = typeof productMedia.$inferSelect;
export type NewProductMedia = typeof productMedia.$inferInsert;
