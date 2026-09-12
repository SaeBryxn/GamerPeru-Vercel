import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { aiProposalFieldReviews } from "./proposal-reviews";
import { aiSources } from "./sources";

/**
 * AI Proposal Field Sources Entity
 *
 * Relational many-to-many link between field-level reviews and normalized sources.
 * Expresses supporting, conflicting, or context-only evidence provenance.
 */
export const aiProposalFieldSources = pgTable(
  "ai_proposal_field_sources",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    fieldReviewId: uuid("field_review_id")
      .notNull()
      .references(() => aiProposalFieldReviews.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => aiSources.id, { onDelete: "restrict" }),
    relationship: varchar("relationship", { length: 20 }).notNull(),
    sourceValue: jsonb("source_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ai_proposal_field_sources_review_source_rel_unique").on(
      table.fieldReviewId,
      table.sourceId,
      table.relationship
    ),
    check(
      "ai_proposal_field_sources_relationship_check",
      sql`${table.relationship} IN ('SUPPORTS', 'CONFLICTS', 'CONTEXT_ONLY')`
    ),
    index("ai_proposal_field_sources_review_idx").on(table.fieldReviewId),
    index("ai_proposal_field_sources_source_idx").on(table.sourceId),
  ]
);
