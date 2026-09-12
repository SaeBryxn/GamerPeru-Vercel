import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { aiProfiles } from "./profiles";

/**
 * AI Research Jobs Entity
 *
 * Aggregate root for single or batch asynchronous AI product research tasks.
 * Strictly decoupled from Inngest execution via durable dispatch reconciliation.
 */
export const aiResearchJobs = pgTable(
  "ai_research_jobs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    mutationRequestDigest: varchar("mutation_request_digest", { length: 64 }).notNull().unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    selectedProfileId: uuid("selected_profile_id")
      .notNull()
      .references(() => aiProfiles.id, { onDelete: "restrict" }),
    profileSnapshot: jsonb("profile_snapshot").notNull(),
    jobType: varchar("job_type", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("QUEUED"),
    dispatchStatus: varchar("dispatch_status", { length: 20 })
      .notNull()
      .default("PENDING_DISPATCH"),
    inngestEventId: varchar("inngest_event_id", { length: 128 }).notNull().unique(),
    totalItems: integer("total_items").notNull().default(1),
    completedItems: integer("completed_items").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    createdByAuthUserId: uuid("created_by_auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      "ai_research_jobs_mutation_request_digest_format",
      sql`${table.mutationRequestDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "ai_research_jobs_request_fingerprint_format",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    check("ai_research_jobs_job_type_check", sql`${table.jobType} IN ('SINGLE', 'BATCH')`),
    check(
      "ai_research_jobs_status_check",
      sql`${table.status} IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED')`
    ),
    check(
      "ai_research_jobs_dispatch_status_check",
      sql`${table.dispatchStatus} IN ('PENDING_DISPATCH', 'DISPATCHED', 'DISPATCH_FAILED')`
    ),
    check("ai_research_jobs_total_items_positive", sql`${table.totalItems} > 0`),
    check("ai_research_jobs_completed_items_non_negative", sql`${table.completedItems} >= 0`),
    check("ai_research_jobs_failed_items_non_negative", sql`${table.failedItems} >= 0`),
    check(
      "ai_research_jobs_items_sum_check",
      sql`${table.completedItems} + ${table.failedItems} <= ${table.totalItems}`
    ),
    index("ai_research_jobs_dispatch_recon_idx")
      .on(table.dispatchStatus, table.updatedAt)
      .where(sql`${table.dispatchStatus} IN ('PENDING_DISPATCH', 'DISPATCH_FAILED')`),
  ]
);
