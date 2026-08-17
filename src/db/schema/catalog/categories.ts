import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { catalogStatusEnum } from "../enums";

/**
 * Categories Entity
 *
 * Represents the multi-tier gaming peripherals taxonomy (Mouses, Teclados, Audio, Mousepads, Accesorios).
 *
 * Note on Canonical Deferred Field:
 * - `current_spec_schema_id` (FK -> CategorySpecificationSchema) is deferred to GP-013/GP-014.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    status: catalogStatusEnum("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("categories_slug_idx").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
    index("categories_status_display_order_idx").on(table.status, table.displayOrder),
    index("categories_name_trgm_idx").using("gin", table.name.op("extensions.gin_trgm_ops")),
    check("categories_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("categories_display_order_non_negative", sql`${table.displayOrder} >= 0`),
    check(
      "categories_parent_id_no_self_cycle",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
    ),
  ]
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
