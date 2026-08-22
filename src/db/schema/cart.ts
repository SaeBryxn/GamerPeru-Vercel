import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../utils/uuid";
import { productVariants } from "./catalog/product-variants";
import { customerProfiles } from "./identity/customer-profiles";

/**
 * Gamer Perú — Canonical Cart Status Enum
 *
 * Status lifecycle:
 * - ACTIVE: Transient shopping session actively receiving line modifications.
 * - CONVERTED: Successfully transformed into an Order at checkout (owned by GP-018).
 * - ABANDONED: Replaced upon login merge, expired, or superseded.
 */
export const cartStatusEnum = pgEnum("cart_status", ["ACTIVE", "CONVERTED", "ABANDONED"]);

/**
 * Carts Entity
 *
 * Models transient shopping intent for both guest sessions and authenticated customers.
 *
 * Canonical Invariants:
 * 1. Ownership XOR: Exactly one of customer_id or session_token must be populated.
 * 2. Active Uniqueness: At most one ACTIVE cart per authenticated customer, and at most one
 *    ACTIVE cart per anonymous session token.
 * 3. Expiry: expires_at is NOT NULL with sliding TTL (30d anonymous, 60d authenticated).
 * 4. Currency: Locked to 'PEN' (Peruvian Soles).
 * 5. Customer Profile Deletion: customer_id FK has ON DELETE CASCADE.
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    customerId: uuid("customer_id").references((): AnyPgColumn => customerProfiles.id, {
      onDelete: "cascade",
    }),
    sessionToken: varchar("session_token", { length: 255 }),
    status: cartStatusEnum("status").notNull().default("ACTIVE"),
    currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      "carts_ownership_xor_check",
      sql`(${table.customerId} IS NOT NULL AND ${table.sessionToken} IS NULL) OR (${table.customerId} IS NULL AND ${table.sessionToken} IS NOT NULL)`
    ),
    uniqueIndex("carts_customer_id_active_unique")
      .on(table.customerId)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.customerId} IS NOT NULL`),
    uniqueIndex("carts_session_token_active_unique")
      .on(table.sessionToken)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.sessionToken} IS NOT NULL`),
  ]
);

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;

/**
 * Cart Items Entity
 *
 * Represents individual variant line items belonging to a Cart.
 *
 * Canonical Invariants:
 * 1. Cart Cascade: cart_id FK has ON DELETE CASCADE (deleting cart purges lines).
 * 2. Variant Restrict: variant_id FK has ON DELETE RESTRICT (protects catalog integrity).
 * 3. Variant Uniqueness: UNIQUE(cart_id, variant_id) prevents duplicate variant lines.
 * 4. Quantity Bounds: 1 <= quantity <= 10 (bounded by MAX_CART_LINE_QUANTITY = 10).
 */
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    cartId: uuid("cart_id")
      .notNull()
      .references((): AnyPgColumn => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references((): AnyPgColumn => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("cart_items_cart_id_variant_id_unique").on(table.cartId, table.variantId),
    index("cart_items_cart_id_idx").on(table.cartId),
    index("cart_items_variant_id_idx").on(table.variantId),
    check(
      "cart_items_quantity_bounds_check",
      sql`${table.quantity} >= 1 AND ${table.quantity} <= 10`
    ),
  ]
);

export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
