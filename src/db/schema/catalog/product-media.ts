import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
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
    productId: uuid("product_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    variantId: uuid("variant_id"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "product_media_product_fk",
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "product_media_media_asset_fk",
      columns: [table.mediaAssetId],
      foreignColumns: [mediaAssets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "product_media_variant_fk",
      columns: [table.variantId],
      foreignColumns: [productVariants.id],
    }).onDelete("cascade"),
    index("product_media_product_idx").on(table.productId, table.displayOrder.asc()),
    index("product_media_variant_idx").on(table.variantId),
    check("product_media_display_order_check", sql`${table.displayOrder} >= 0`),
  ]
);

export type ProductMedia = typeof productMedia.$inferSelect;
export type NewProductMedia = typeof productMedia.$inferInsert;
