import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { aiProductProposals } from "./proposals";
import { aiSources } from "./sources";

/**
 * AI Proposal Field Reviews Entity
 *
 * Granular field-level decision ledger tracking human acceptance, rejection,
 * manual edits, and conflict resolution per proposed field.
 */
export const aiProposalFieldReviews = pgTable(
  "ai_proposal_field_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => aiProductProposals.id, { onDelete: "restrict" }),
    fieldPath: varchar("field_path", { length: 100 }).notNull(),
    proposedValue: jsonb("proposed_value").notNull(),
    selectedValue: jsonb("selected_value"),
    decision: varchar("decision", { length: 20 }).notNull().default("PENDING"),
    verificationState: varchar("verification_state", { length: 30 }).notNull(),
    preferredSourceId: uuid("preferred_source_id").references(() => aiSources.id, {
      onDelete: "set null",
    }),
    conflictDetails: jsonb("conflict_details"),
    reviewedByAuthUserId: uuid("reviewed_by_auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("ai_proposal_field_reviews_proposal_field_unique").on(table.proposalId, table.fieldPath),
    check(
      "ai_proposal_field_reviews_decision_check",
      sql`${table.decision} IN ('PENDING', 'ACCEPTED', 'REJECTED', 'MANUALLY_EDITED')`
    ),
    check(
      "ai_proposal_field_reviews_verification_state_check",
      sql`${table.verificationState} IN ('VERIFIED_OFFICIAL', 'VERIFIED_SECONDARY', 'AI_INFERRED', 'SOURCE_CONFLICT', 'UNVERIFIED')`
    ),
  ]
);
