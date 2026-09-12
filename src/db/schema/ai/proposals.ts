import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { brands } from "../catalog/brands";
import { categories } from "../catalog/categories";
import { products } from "../catalog/products";
import { authUsers } from "../identity/auth-users";
import { aiResearchJobItems } from "./items";

/**
 * AI Product Proposals Entity
 *
 * Synthesized candidate product record resulting from AI research.
 * Requires explicit human review before canonical catalog publication.
 */
export const aiProductProposals = pgTable(
  "ai_product_proposals",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    jobItemId: uuid("job_item_id")
      .notNull()
      .unique()
      .references(() => aiResearchJobItems.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    proposedName: varchar("proposed_name", { length: 200 }).notNull(),
    proposedSlug: varchar("proposed_slug", { length: 200 }).notNull(),
    proposedSubtitle: varchar("proposed_subtitle", { length: 255 }),
    proposedDescription: text("proposed_description"),
    proposedSpecifications: jsonb("proposed_specifications").notNull().default({}),
    unmappedSpecifications: jsonb("unmapped_specifications").notNull().default({}),
    proposedVariants: jsonb("proposed_variants").notNull().default([]),
    proposedSeoDraft: jsonb("proposed_seo_draft").notNull().default({}),
    mediaCandidates: jsonb("media_candidates").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
    appliedProductId: uuid("applied_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    reviewedByAuthUserId: uuid("reviewed_by_auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      "ai_product_proposals_status_check",
      sql`${table.status} IN ('DRAFT', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED')`
    ),
    index("ai_product_proposals_status_idx").on(table.status, table.updatedAt),
    index("ai_product_proposals_job_item_idx").on(table.jobItemId),
  ]
);
