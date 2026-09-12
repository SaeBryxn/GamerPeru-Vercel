import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { products } from "../catalog/products";
import { aiResearchJobs } from "./jobs";

/**
 * AI Research Job Items Entity
 *
 * Unit of execution for a single product query within a research job.
 * Supports CREATE and ENRICH modes with optimistic lease-fencing.
 */
export const aiResearchJobItems = pgTable(
  "ai_research_job_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiResearchJobs.id, { onDelete: "restrict" }),
    itemIndex: integer("item_index").notNull(),
    inputQuery: text("input_query").notNull(),
    mode: varchar("mode", { length: 20 }).notNull().default("CREATE"),
    targetProductId: uuid("target_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    targetProductVersionSnapshot: timestamp("target_product_version_snapshot", {
      withTimezone: true,
    }),
    identityStatus: varchar("identity_status", { length: 30 }).notNull().default("PENDING"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    processingLeaseToken: uuid("processing_lease_token"),
    processingLeaseExpiresAt: timestamp("processing_lease_expires_at", {
      withTimezone: true,
    }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("ai_research_job_items_job_id_item_index_unique").on(table.jobId, table.itemIndex),
    check("ai_research_job_items_item_index_non_negative", sql`${table.itemIndex} >= 0`),
    check("ai_research_job_items_mode_check", sql`${table.mode} IN ('CREATE', 'ENRICH')`),
    check(
      "ai_research_job_items_identity_status_check",
      sql`${table.identityStatus} IN ('PENDING', 'EXACT_MATCH', 'PROBABLE_MATCH', 'AMBIGUOUS', 'UNSUPPORTED_CATEGORY', 'CONFLICTING_IDENTIFIERS', 'MANUALLY_DISAMBIGUATED')`
    ),
    check(
      "ai_research_job_items_status_check",
      sql`${table.status} IN ('PENDING', 'RESEARCHING', 'READY_FOR_REVIEW', 'NEEDS_ATTENTION', 'AMBIGUOUS', 'SOURCE_CONFLICT', 'FAILED', 'APPROVED', 'APPLIED')`
    ),
    check(
      "ai_research_job_items_mode_product_snapshot_check",
      sql`(${table.mode} = 'CREATE' AND ${table.targetProductId} IS NULL AND ${table.targetProductVersionSnapshot} IS NULL) OR (${table.mode} = 'ENRICH' AND ${table.targetProductId} IS NOT NULL AND ${table.targetProductVersionSnapshot} IS NOT NULL)`
    ),
    index("ai_research_job_items_job_status_idx").on(table.jobId, table.status),
    index("ai_research_job_items_lease_reclaim_idx")
      .on(table.status, table.processingLeaseExpiresAt)
      .where(sql`${table.status} = 'RESEARCHING'`),
  ]
);
