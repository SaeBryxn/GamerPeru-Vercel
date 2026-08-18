import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { catalogStatusEnum } from "../enums";
import { products } from "./products";

/**
 * Supabase Auth Users Reference Target
 *
 * Scoped reference to auth.users for staff attribution without owning or altering
 * Supabase internal auth schema.
 */
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/**
 * Persisted Story Block Storage Shape
 *
 * Canonical stored JSON structure in product_story_revisions.blocks.
 */
export interface PersistedStoryBlock {
  block_id: string;
  type: string;
  order: number;
  payload: Record<string, unknown>;
}

/**
 * Product Story Revisions Entity
 *
 * Represents an immutable/versioned editorial storytelling revision for a Product.
 */
export const productStoryRevisions = pgTable(
  "product_story_revisions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    productId: uuid("product_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    status: catalogStatusEnum("status").notNull().default("DRAFT"),
    blocks: jsonb("blocks").$type<PersistedStoryBlock[]>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByAuthUserId: uuid("created_by_auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "product_story_revisions_product_fk",
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete("cascade"),
    unique("product_story_revisions_product_revision_unique").on(
      table.productId,
      table.revisionNumber
    ),
    index("product_story_revisions_product_status_idx").on(table.productId, table.status),
    check("product_story_revisions_revision_positive", sql`${table.revisionNumber} > 0`),
    check("product_story_revisions_blocks_array", sql`jsonb_typeof(${table.blocks}) = 'array'`),
    check(
      "product_story_revisions_published_at_check",
      sql`${table.status} != 'PUBLISHED' OR ${table.publishedAt} IS NOT NULL`
    ),
  ]
);

/**
 * Product Stories Entity
 *
 * Aggregate root linking a Product to its active published story revision.
 */
export const productStories = pgTable(
  "product_stories",
  {
    productId: uuid("product_id").primaryKey(),
    publishedRevisionId: uuid("published_revision_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "product_stories_product_fk",
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "product_stories_published_revision_fk",
      columns: [table.publishedRevisionId],
      foreignColumns: [productStoryRevisions.id],
    }).onDelete("set null"),
  ]
);

export type ProductStoryRevision = typeof productStoryRevisions.$inferSelect;
export type NewProductStoryRevision = typeof productStoryRevisions.$inferInsert;
export type ProductStory = typeof productStories.$inferSelect;
export type NewProductStory = typeof productStories.$inferInsert;
