import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { aiProductProposals } from "./proposals";

/**
 * AI Proposal Apply Steps Entity
 *
 * Crash-safe mutation replay tracking for canonical catalog entity application.
 * Persists frozen payload, stable mutation ID, and execution status per step.
 */
export const aiProposalApplySteps = pgTable(
  "ai_proposal_apply_steps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => aiProductProposals.id, { onDelete: "restrict" }),
    applyOperationId: uuid("apply_operation_id").notNull(),
    applyActorAuthUserId: uuid("apply_actor_auth_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    stepKey: varchar("step_key", { length: 50 }).notNull(),
    stepOrdinal: integer("step_ordinal").notNull(),
    mutationRequestId: varchar("mutation_request_id", { length: 128 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    requestPayload: jsonb("request_payload").notNull(),
    stepStatus: varchar("step_status", { length: 20 }).notNull().default("PREPARED"),
    targetId: uuid("target_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("ai_proposal_apply_steps_proposal_step_unique").on(table.proposalId, table.stepKey),
    unique("ai_proposal_apply_steps_operation_step_unique").on(
      table.applyOperationId,
      table.stepKey
    ),
    check("ai_proposal_apply_steps_step_ordinal_non_negative", sql`${table.stepOrdinal} >= 0`),
    check(
      "ai_proposal_apply_steps_request_fingerprint_format",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "ai_proposal_apply_steps_step_status_check",
      sql`${table.stepStatus} IN ('PREPARED', 'IN_FLIGHT', 'COMMITTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL')`
    ),
    index("ai_proposal_apply_steps_proposal_step_idx").on(table.proposalId, table.stepKey),
    index("ai_proposal_apply_steps_op_step_idx").on(table.applyOperationId, table.stepKey),
  ]
);
