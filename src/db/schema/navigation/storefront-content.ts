import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { products } from "../catalog/products";
import { homeSections } from "../content/home-sections";
import { storefrontMenuEntries } from "./menu-entries";

/** Editorial selections reference product IDs: renaming a product never loses its placement. */
export const homeSectionProducts = pgTable(
  "home_section_products",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => homeSections.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.productId] }),
    unique("home_section_products_order_unique").on(t.sectionId, t.displayOrder),
    index("home_section_products_product_idx").on(t.productId),
    check("home_section_products_order_check", sql`${t.displayOrder} >= 0`),
  ]
).enableRLS();

export const storefrontMenuProducts = pgTable(
  "storefront_menu_products",
  {
    entryId: varchar("entry_id", { length: 64 })
      .notNull()
      .references(() => storefrontMenuEntries.entryId, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.productId] }),
    unique("storefront_menu_products_order_unique").on(t.entryId, t.displayOrder),
    index("storefront_menu_products_product_idx").on(t.productId),
    check("storefront_menu_products_order_check", sql`${t.displayOrder} >= 0`),
  ]
).enableRLS();

/** Sections and software tiles use the same ordered, hideable link records. */
export const storefrontMenuLinks = pgTable(
  "storefront_menu_links",
  {
    id: uuid("id").primaryKey().$defaultFn(generateUuidV7),
    entryId: varchar("entry_id", { length: 64 })
      .notNull()
      .references(() => storefrontMenuEntries.entryId, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    href: varchar("href", { length: 500 }).notNull(),
    sectionTitle: varchar("section_title", { length: 100 }).notNull().default("Enlaces"),
    placement: varchar("placement", { length: 16 }).notNull().default("section"),
    icon: varchar("icon", { length: 16 }),
    isVisible: boolean("is_visible").notNull().default(true),
    displayOrder: integer("display_order").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("storefront_menu_links_order_idx").on(t.entryId, t.displayOrder),
    check("storefront_menu_links_order_check", sql`${t.displayOrder} >= 0`),
    check("storefront_menu_links_placement_check", sql`${t.placement} IN ('section', 'tile')`),
  ]
).enableRLS();
