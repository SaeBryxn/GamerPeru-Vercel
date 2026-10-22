import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { catalogStatusEnum } from "../enums";
import { brands } from "./brands";
import { categories } from "./categories";
import { mediaAssets } from "./media-assets";

/**
 * Products Entity
 *
 * Represents the conceptual hardware product model / family (e.g., "WLMouse Beast X Magnesium").
 * Core aggregate root for all catalog discovery in GP-011.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    subtitle: varchar("subtitle", { length: 255 }),
    description: text("description"),
    pdpConfig: jsonb("pdp_config").$type<Record<string, unknown>>().notNull().default({}),
    status: catalogStatusEnum("status").notNull().default("DRAFT"),
    isFeatured: boolean("is_featured").notNull().default(false),
    primaryMediaId: uuid("primary_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("products_slug_idx").on(table.slug),
    index("products_category_pagination_idx").on(
      table.categoryId,
      table.status,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("products_brand_pagination_idx").on(
      table.brandId,
      table.status,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("products_status_featured_idx").on(table.status, table.isFeatured),
    index("products_name_trgm_idx").using("gin", table.name.op("extensions.gin_trgm_ops")),
    index("products_subtitle_trgm_idx").using("gin", table.subtitle.op("extensions.gin_trgm_ops")),
    check("products_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
