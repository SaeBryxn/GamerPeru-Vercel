import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaAssets } from "../catalog/media-assets";

const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const homeSectionTypeEnum = pgEnum("home_section_type", [
  "video_hero",
  "product_carousel",
  "feature_video",
  "split_showcase",
  "compare_slider",
  "catalog_rail",
  "bento_showcase",
  "community_banner",
  "trust_strip",
  "brand_strip",
]);

/**
 * Storefront Home Sections (ADR-012)
 *
 * Canonical Invariants:
 * 1. `content` is validated by the payload schema of `section_type` at `content_schema_version`;
 *    the storefront skips a row that fails instead of failing the page.
 * 2. `display_order` is dense after every write and is deliberately not unique, so reorders run
 *    in one locked transaction without deferred constraints.
 * 3. At most one `video_hero` exists; it always renders first.
 * 4. Every write increments `version`; writers must present the version they read.
 */
export const homeSections = pgTable(
  "home_sections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    sectionType: homeSectionTypeEnum("section_type").notNull(),
    displayOrder: integer("display_order").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    contentSchemaVersion: smallint("content_schema_version").notNull().default(1),
    version: integer("version").notNull().default(1),
    updatedByAuthUserId: uuid("updated_by_auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("home_sections_order_idx").on(table.displayOrder, table.id),
    uniqueIndex("home_sections_single_hero_idx")
      .on(table.sectionType)
      .where(sql`${table.sectionType} = 'video_hero'`),
    check("home_sections_display_order_check", sql`${table.displayOrder} >= 0`),
    check("home_sections_version_positive", sql`${table.version} > 0`),
    check("home_sections_content_object", sql`jsonb_typeof(${table.content}) = 'object'`),
  ]
);

/**
 * Media referenced by a home section, one row per slot of its payload. Kept in sync with
 * `content` in the same transaction, so an asset in use cannot be deleted and home media can be
 * listed exactly.
 */
export const homeSectionMedia = pgTable(
  "home_section_media",
  {
    sectionId: uuid("section_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    slot: varchar("slot", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({ name: "home_section_media_pk", columns: [table.sectionId, table.slot] }),
    foreignKey({
      name: "home_section_media_section_fk",
      columns: [table.sectionId],
      foreignColumns: [homeSections.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "home_section_media_asset_fk",
      columns: [table.mediaAssetId],
      foreignColumns: [mediaAssets.id],
    }).onDelete("restrict"),
    index("home_section_media_asset_idx").on(table.mediaAssetId),
  ]
);

export type HomeSectionRow = typeof homeSections.$inferSelect;
export type NewHomeSectionRow = typeof homeSections.$inferInsert;
export type HomeSectionType = (typeof homeSectionTypeEnum.enumValues)[number];
export type HomeSectionMediaRow = typeof homeSectionMedia.$inferSelect;
