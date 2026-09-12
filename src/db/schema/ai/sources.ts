import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { aiResearchJobItems } from "./items";

/**
 * AI Sources Entity
 *
 * Durable evidence sources retrieved during AI research.
 * Normalized independently from individual field proposals.
 */
export const aiSources = pgTable(
  "ai_sources",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    jobItemId: uuid("job_item_id")
      .notNull()
      .references(() => aiResearchJobItems.id, { onDelete: "restrict" }),
    originalUrl: text("original_url"),
    resolvedUrl: text("resolved_url"),
    providerCitationId: varchar("provider_citation_id", { length: 128 }),
    sourceName: varchar("source_name", { length: 150 }).notNull(),
    retrievalMethod: varchar("retrieval_method", { length: 50 }).notNull(),
    trustTier: varchar("trust_tier", { length: 40 }).notNull(),
    trustBasis: varchar("trust_basis", { length: 30 }).notNull(),
    trustReviewedByAuthUserId: uuid("trust_reviewed_by_auth_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    trustReviewedAt: timestamp("trust_reviewed_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentSha256: varchar("content_sha256", { length: 64 }),
    fetchStatus: varchar("fetch_status", { length: 20 }).notNull(),
    snippet: text("snippet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "ai_sources_retrieval_method_check",
      sql`${table.retrievalMethod} IN ('PROVIDER_GROUNDING', 'SEARCH_API', 'DIRECT_URL')`
    ),
    check(
      "ai_sources_trust_tier_check",
      sql`${table.trustTier} IN ('TIER_1_OFFICIAL_MANUFACTURER', 'TIER_2_OFFICIAL_MANUAL', 'TIER_3_OFFICIAL_MEDIA_KIT', 'TIER_4_AUTHORIZED_DISTRIBUTOR', 'TIER_5_REPUTABLE_SECONDARY', 'TIER_6_PUBLIC_SUPPORTING')`
    ),
    check(
      "ai_sources_trust_basis_check",
      sql`${table.trustBasis} IN ('CANONICAL_BRAND_DOMAIN_MATCH', 'MANUAL_STAFF_VERIFIED', 'UNVERIFIED_DEFAULT')`
    ),
    check(
      "ai_sources_content_sha256_format",
      sql`${table.contentSha256} IS NULL OR ${table.contentSha256} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "ai_sources_fetch_status_check",
      sql`${table.fetchStatus} IN ('SUCCESS', 'FAILED', 'FILTERED_UNTRUSTED')`
    ),
    check(
      "ai_sources_url_or_citation_check",
      sql`${table.originalUrl} IS NOT NULL OR ${table.providerCitationId} IS NOT NULL`
    ),
    index("ai_sources_job_item_idx").on(table.jobItemId),
  ]
);
