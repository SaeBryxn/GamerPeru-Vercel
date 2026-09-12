import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { aiResearchJobItems } from "./items";
import { aiProfiles } from "./profiles";
import { aiProviders } from "./providers";

/**
 * AI Provider Attempts Entity
 *
 * Immutable ledger of raw external AI provider invocations with token usage,
 * error state, and exact sub-cent monetary cost accounting (cost_micros).
 */
export const aiProviderAttempts = pgTable(
  "ai_provider_attempts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    jobItemId: uuid("job_item_id")
      .notNull()
      .references(() => aiResearchJobItems.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "restrict" }),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => aiProfiles.id, { onDelete: "restrict" }),
    profileKey: varchar("profile_key", { length: 50 }).notNull(),
    temperature: numeric("temperature", { precision: 3, scale: 2 }).notNull(),
    maxTokens: integer("max_tokens").notNull(),
    operationType: varchar("operation_type", { length: 50 }).notNull(),
    attemptOrdinal: integer("attempt_ordinal").notNull(),
    requestDigest: varchar("request_digest", { length: 64 }).notNull(),
    providerRequestId: varchar("provider_request_id", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull(),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "bigint" }),
    currency: varchar("currency", { length: 3 }),
    costSource: varchar("cost_source", { length: 20 }).notNull(),
    pricingVersion: varchar("pricing_version", { length: 50 }),
    pricingEffectiveAt: timestamp("pricing_effective_at", { withTimezone: true }),
    providerBillingReference: varchar("provider_billing_reference", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ai_provider_attempts_job_ordinal_op_unique").on(
      table.jobItemId,
      table.attemptOrdinal,
      table.operationType
    ),
    check(
      "ai_provider_attempts_operation_type_check",
      sql`${table.operationType} IN ('IDENTITY_RESOLUTION', 'SPEC_EXTRACTION', 'COPY_GENERATION')`
    ),
    check("ai_provider_attempts_attempt_ordinal_positive", sql`${table.attemptOrdinal} >= 1`),
    check(
      "ai_provider_attempts_request_digest_format",
      sql`${table.requestDigest} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "ai_provider_attempts_status_check",
      sql`${table.status} IN ('RUNNING', 'COMPLETED', 'FAILED', 'RATE_LIMITED', 'UNKNOWN')`
    ),
    check("ai_provider_attempts_input_tokens_non_negative", sql`${table.inputTokens} >= 0`),
    check("ai_provider_attempts_output_tokens_non_negative", sql`${table.outputTokens} >= 0`),
    check("ai_provider_attempts_total_tokens_non_negative", sql`${table.totalTokens} >= 0`),
    check(
      "ai_provider_attempts_cost_micros_check",
      sql`${table.costMicros} IS NULL OR ${table.costMicros} >= 0`
    ),
    check(
      "ai_provider_attempts_currency_format",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "ai_provider_attempts_cost_source_check",
      sql`${table.costSource} IN ('UNAVAILABLE', 'ESTIMATED', 'PROVIDER_REPORTED')`
    ),
    check(
      "ai_provider_attempts_cost_integrity_check",
      sql`(${table.costSource} = 'UNAVAILABLE' AND ${table.costMicros} IS NULL AND ${table.currency} IS NULL) OR (${table.costSource} IN ('ESTIMATED', 'PROVIDER_REPORTED') AND ${table.costMicros} IS NOT NULL AND ${table.currency} IS NOT NULL)`
    ),
    index("ai_provider_attempts_job_ordinal_idx").on(
      table.jobItemId,
      table.operationType,
      table.attemptOrdinal
    ),
    index("ai_provider_attempts_status_idx").on(table.status, table.startedAt),
  ]
);
