import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaAssets } from "./media-assets";
import { productVariants } from "./product-variants";
import { products } from "./products";

/**
 * Where an attached image is shown. GALLERY images make up the product gallery, cards and
 * thumbnails; STORY images are uploaded for the product story only and never appear there.
 */
export const productMediaPlacementEnum = pgEnum("product_media_placement", ["GALLERY", "STORY"]);

/**
 * Product Media Entity
 *
 * Maps ordered PDP gallery media assets to a Product, with optional
 * association to a specific ProductVariant SKU. Story-only uploads share the table (and its
 * ownership checks) with placement STORY.
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
    placement: productMediaPlacementEnum("placement").notNull().default("GALLERY"),
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
    index("product_media_product_placement_idx").on(table.productId, table.placement),
    index("product_media_variant_idx").on(table.variantId),
    check("product_media_display_order_check", sql`${table.displayOrder} >= 0`),
  ]
);

export type ProductMedia = typeof productMedia.$inferSelect;
export type ProductMediaPlacement = (typeof productMediaPlacementEnum.enumValues)[number];
export type NewProductMedia = typeof productMedia.$inferInsert;
