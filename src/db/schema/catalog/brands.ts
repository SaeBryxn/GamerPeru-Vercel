import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { catalogStatusEnum } from "../enums";
import { mediaAssets } from "./media-assets";

/**
 * Brands Entity
 *
 * Represents hardware manufacturers (e.g., WLMouse, Pulsar, Lamzu, Wooting).
 */
export const brands = pgTable(
  "brands",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    websiteUrl: varchar("website_url", { length: 255 }),
    logoMediaId: uuid("logo_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    status: catalogStatusEnum("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("brands_name_idx").on(table.name),
    uniqueIndex("brands_slug_idx").on(table.slug),
    index("brands_status_idx").on(table.status),
    check("brands_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ]
);

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
