import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";
import { products } from "./catalog/products";
import { customerProfiles } from "./identity/customer-profiles";

/**
 * Wishlist Items Entity (Commerce Domain Model §39)
 *
 * Products a customer saved for later. Owned by the authenticated customer only.
 *
 * Invariants:
 * 1. A product appears at most once per customer: UNIQUE(customer_id, product_id).
 * 2. Deleting a customer profile removes their wishlist (ON DELETE CASCADE).
 * 3. Archiving a product keeps the row; listings filter out products that are no longer
 *    published. Only a hard product delete removes it.
 */
export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("wishlist_items_customer_product_unique").on(table.customerId, table.productId),
    index("wishlist_items_customer_created_idx").on(table.customerId, table.createdAt),
  ]
);
