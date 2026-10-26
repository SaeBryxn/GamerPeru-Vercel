import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";
import { products } from "./catalog/products";
import { customerProfiles } from "./identity/customer-profiles";
import { orderItems } from "./orders/order-items";

/**
 * PENDING: written by the customer, waiting for staff. APPROVED: shown on the product page and
 * counted in its rating. REJECTED: kept for the record, never shown.
 */
export const reviewStatusEnum = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED"]);

export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];

/**
 * Product Reviews
 *
 * Invariants:
 * 1. Only a verified buyer reviews: `order_item_id` is a line of one of the customer's fulfilled
 *    orders for this product (checked by the service, kept here as the proof).
 * 2. One review per customer and product: UNIQUE(customer_id, product_id).
 * 3. Nothing is public until staff approve it; the rating counts approved reviews only.
 * 4. `author_name` is a snapshot ("Bryan E."), so a later profile edit does not rewrite history.
 * 5. Deleting a customer or a product removes their reviews; a deleted order line only drops the
 *    link to it.
 */
export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    rating: smallint("rating").notNull(),
    title: varchar("title", { length: 120 }),
    body: text("body").notNull(),
    photoAssetIds: jsonb("photo_asset_ids").$type<string[]>().notNull().default([]),
    authorName: varchar("author_name", { length: 80 }).notNull(),
    status: reviewStatusEnum("status").notNull().default("PENDING"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderatedBy: uuid("moderated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("product_reviews_customer_product_unique").on(table.customerId, table.productId),
    index("product_reviews_product_status_created_idx").on(
      table.productId,
      table.status,
      table.createdAt
    ),
    index("product_reviews_status_created_idx").on(table.status, table.createdAt),
    check("product_reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
    check(
      "product_reviews_photo_limit",
      sql`jsonb_typeof(${table.photoAssetIds}) = 'array' AND jsonb_array_length(${table.photoAssetIds}) <= 3`
    ),
    check("product_reviews_body_length", sql`char_length(${table.body}) BETWEEN 10 AND 2000`),
  ]
);

export type ProductReview = typeof productReviews.$inferSelect;
