import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiResearchJobItems, aiResearchJobs } from "@/db/schema";
import { AI_RESEARCH_LIMITS } from "./config";
import { LeaseLostError } from "./types";
import type { ResearchErrorCode } from "./types";

export interface ClaimedResearchItem {
  id: string;
  jobId: string;
  query: string;
  mode: "CREATE" | "ENRICH";
  targetProductId: string | null;
  targetProductVersionSnapshot: Date | null;
  leaseToken: string;
  errorCode: string | null;
}

export async function claimResearchItem(jobId?: string): Promise<ClaimedResearchItem | null> {
  const leaseToken = generateUuidV7();
  const leaseSeconds = Math.floor(AI_RESEARCH_LIMITS.leaseDurationMs / 1_000);
  const row = await db.transaction(async (tx) => {
    const rows = jobId
      ? await tx.execute<{
          id: string;
          job_id: string;
          input_query: string;
          mode: "CREATE" | "ENRICH";
          target_product_id: string | null;
          target_product_version_snapshot: Date | null;
          error_code: string | null;
        }>(sql`
        WITH candidate AS (
          SELECT id
          FROM ai_research_job_items
          WHERE job_id = ${jobId}::uuid
            AND ((status = 'PENDING' AND processing_lease_token IS NULL)
              OR (status = 'RESEARCHING' AND processing_lease_expires_at < NOW()))
          ORDER BY item_index
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ai_research_job_items item
        SET status = 'RESEARCHING',
            processing_lease_token = ${leaseToken}::uuid,
            processing_lease_expires_at = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
            last_heartbeat_at = NOW(),
            updated_at = NOW()
        FROM candidate
        WHERE item.id = candidate.id
        RETURNING item.id, item.job_id, item.input_query, item.mode,
          item.target_product_id, item.target_product_version_snapshot, item.error_code
        `)
      : await tx.execute<{
          id: string;
          job_id: string;
          input_query: string;
          mode: "CREATE" | "ENRICH";
          target_product_id: string | null;
          target_product_version_snapshot: Date | null;
          error_code: string | null;
        }>(sql`
        WITH candidate AS (
          SELECT id
          FROM ai_research_job_items
          WHERE (status = 'PENDING' AND processing_lease_token IS NULL)
             OR (status = 'RESEARCHING' AND processing_lease_expires_at < NOW())
          ORDER BY created_at, item_index
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ai_research_job_items item
        SET status = 'RESEARCHING',
            processing_lease_token = ${leaseToken}::uuid,
            processing_lease_expires_at = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
            last_heartbeat_at = NOW(),
            updated_at = NOW()
        FROM candidate
        WHERE item.id = candidate.id
        RETURNING item.id, item.job_id, item.input_query, item.mode,
          item.target_product_id, item.target_product_version_snapshot, item.error_code
        `);
    const claimed = rows[0];
    if (claimed) {
      await tx
        .update(aiResearchJobs)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(aiResearchJobs.id, claimed.job_id));
    }
    return claimed;
  });
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    query: row.input_query,
    mode: row.mode,
    targetProductId: row.target_product_id,
    targetProductVersionSnapshot: row.target_product_version_snapshot,
    leaseToken,
    errorCode: row.error_code,
  };
}

export async function heartbeatResearchItem(itemId: string, leaseToken: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(aiResearchJobItems)
    .set({
      lastHeartbeatAt: now,
      processingLeaseExpiresAt: new Date(now.getTime() + AI_RESEARCH_LIMITS.leaseDurationMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(aiResearchJobItems.id, itemId),
        eq(aiResearchJobItems.processingLeaseToken, leaseToken),
        gt(aiResearchJobItems.processingLeaseExpiresAt, now)
      )
    )
    .returning({ id: aiResearchJobItems.id });
  if (!row) throw new LeaseLostError();
}

export async function markSearchInProgress(itemId: string, leaseToken: string): Promise<void> {
  const [row] = await db
    .update(aiResearchJobItems)
    .set({ errorCode: "AI_SEARCH_IN_PROGRESS", errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(aiResearchJobItems.id, itemId),
        eq(aiResearchJobItems.processingLeaseToken, leaseToken),
        gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
      )
    )
    .returning({ id: aiResearchJobItems.id });
  if (!row) throw new LeaseLostError();
}

export async function failResearchItem(
  itemId: string,
  leaseToken: string,
  code: ResearchErrorCode,
  needsAttention = false
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiResearchJobItems)
      .set({
        status: needsAttention ? "NEEDS_ATTENTION" : "FAILED",
        errorCode: code,
        errorMessage: null,
        processingLeaseToken: null,
        processingLeaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiResearchJobItems.id, itemId),
          eq(aiResearchJobItems.processingLeaseToken, leaseToken),
          gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
        )
      )
      .returning({ jobId: aiResearchJobItems.jobId });
    if (!row) throw new LeaseLostError();
    await tx.execute(researchJobCounterUpdate(row.jobId));
  });
}

export async function finishResearchItemWithoutProposal(
  itemId: string,
  leaseToken: string,
  status: "AMBIGUOUS" | "SOURCE_CONFLICT" | "NEEDS_ATTENTION",
  identityStatus:
    "AMBIGUOUS" | "UNSUPPORTED_CATEGORY" | "CONFLICTING_IDENTIFIERS" | "PROBABLE_MATCH"
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiResearchJobItems)
      .set({
        status,
        identityStatus,
        errorCode: null,
        errorMessage: null,
        processingLeaseToken: null,
        processingLeaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiResearchJobItems.id, itemId),
          eq(aiResearchJobItems.processingLeaseToken, leaseToken),
          gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
        )
      )
      .returning({ jobId: aiResearchJobItems.jobId });
    if (!row) throw new LeaseLostError();
    await tx.execute(researchJobCounterUpdate(row.jobId));
  });
}

export function researchJobCounterUpdate(jobId: string) {
  return sql`
    WITH counts AS (
      SELECT
        count(*) FILTER (WHERE status IN ('READY_FOR_REVIEW', 'NEEDS_ATTENTION', 'AMBIGUOUS', 'SOURCE_CONFLICT', 'APPROVED', 'APPLIED'))::int AS completed,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE status IN ('PENDING', 'RESEARCHING'))::int AS active
      FROM ai_research_job_items
      WHERE job_id = ${jobId}::uuid
    )
    UPDATE ai_research_jobs job
    SET completed_items = counts.completed,
        failed_items = counts.failed,
        status = CASE
          WHEN counts.active > 0 THEN 'PROCESSING'
          WHEN counts.failed > 0 AND counts.completed > 0 THEN 'PARTIALLY_FAILED'
          WHEN counts.failed > 0 AND counts.completed = 0 THEN 'FAILED'
          WHEN counts.completed > 0 AND counts.failed = 0 THEN 'COMPLETED'
          ELSE 'FAILED'
        END,
        updated_at = NOW()
    FROM counts
    WHERE job.id = ${jobId}::uuid
  `;
}

export async function refreshResearchJobCounters(jobId: string): Promise<void> {
  await db.execute(researchJobCounterUpdate(jobId));
}

export async function recoverExpiredResearchWork(limit = 50): Promise<{
  requeued: number;
  needsAttention: number;
  attemptsUnknown: number;
}> {
  return await db.transaction(async (tx) => {
    const expired = await tx.execute<{ id: string; job_id: string; error_code: string | null }>(sql`
      SELECT id, job_id, error_code
      FROM ai_research_job_items
      WHERE status = 'RESEARCHING' AND processing_lease_expires_at < NOW()
      ORDER BY processing_lease_expires_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);
    let requeued = 0;
    let needsAttention = 0;
    for (const item of expired) {
      const ambiguous = item.error_code === "AI_SEARCH_IN_PROGRESS";
      await tx.execute(sql`
        UPDATE ai_research_job_items
        SET status = ${ambiguous ? "NEEDS_ATTENTION" : "PENDING"},
            error_code = ${ambiguous ? "AI_SEARCH_OUTCOME_UNKNOWN" : null},
            error_message = NULL,
            processing_lease_token = NULL,
            processing_lease_expires_at = NULL,
            last_heartbeat_at = NULL,
            updated_at = NOW()
        WHERE id = ${item.id}::uuid
      `);
      if (ambiguous) needsAttention += 1;
      else requeued += 1;
    }
    for (const jobId of new Set(expired.map((item) => item.job_id))) {
      await tx.execute(researchJobCounterUpdate(jobId));
    }
    const attemptRows = await tx.execute<{ id: string }>(sql`
      UPDATE ai_provider_attempts
      SET status = 'UNKNOWN', completed_at = NOW(), error_code = 'AI_PROVIDER_OUTCOME_UNKNOWN',
          error_message = NULL
      WHERE id IN (
        SELECT id FROM ai_provider_attempts
        WHERE status = 'RUNNING'
          AND started_at < NOW() - (${Math.floor(
            AI_RESEARCH_LIMITS.abandonedAttemptAfterMs / 1_000
          )} * INTERVAL '1 second')
          AND EXISTS (
            SELECT 1 FROM ai_research_job_items item
            WHERE item.id = ai_provider_attempts.job_item_id
              AND (item.status <> 'RESEARCHING'
                OR item.processing_lease_token IS NULL
                OR item.processing_lease_expires_at <= NOW())
          )
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id
    `);
    return { requeued, needsAttention, attemptsUnknown: attemptRows.length };
  });
}
