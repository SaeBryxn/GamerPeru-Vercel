import type { MenuProductSelection } from "@/lib/navigation/menu-display";
import { boolean, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Storefront Menu Entries
 *
 * Visibility and ordering overrides for the top-level storefront navigation.
 *
 * Canonical Invariants:
 * 1. entryId is the primary key and matches an id declared in the navigation configuration;
 *    rows for unknown ids are ignored rather than rendered, so a renamed entry cannot resurrect
 *    a menu section that no longer exists in code.
 * 2. Structure only: the menu itself lives in configuration. This table stores just the
 *    operator's decisions about what the store currently sells.
 * 3. A missing row means the entry keeps the default declared in configuration.
 */
export const storefrontMenuEntries = pgTable("storefront_menu_entries", {
  entryId: varchar("entry_id", { length: 64 }).primaryKey(),
  isVisible: boolean("is_visible").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  label: varchar("label", { length: 100 }),
  href: varchar("href", { length: 500 }),
  linksConfigured: boolean("links_configured").notNull().default(false),
  productSelection: jsonb("product_selection").$type<MenuProductSelection>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StorefrontMenuEntry = typeof storefrontMenuEntries.$inferSelect;
export type NewStorefrontMenuEntry = typeof storefrontMenuEntries.$inferInsert;
