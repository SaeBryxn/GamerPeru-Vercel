import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiResearchJobs } from "@/db/schema";
import { AI_RESEARCH_LIMITS } from "./config";

export interface ResearchEventSender {
  send(event: {
    id: string;
    name: "gp/ai.research-job.requested";
    data: { jobId: string };
  }): Promise<unknown> | unknown;
}

const defaultSender: ResearchEventSender = {
  async send(event) {
    // The Inngest SDK (~350 KB) loads only when a job is actually queued, not with every
    // admin screen that imports this module.
    const { inngest } = await import("@/lib/inngest/client");
    return await inngest.send(event);
  },
};

export async function dispatchResearchJob(
  jobId: string,
  sender: ResearchEventSender = defaultSender
): Promise<"DISPATCHED" | "NOT_ELIGIBLE"> {
  const [job] = await db
    .select({
      id: aiResearchJobs.id,
      eventId: aiResearchJobs.inngestEventId,
      dispatchStatus: aiResearchJobs.dispatchStatus,
    })
    .from(aiResearchJobs)
    .where(eq(aiResearchJobs.id, jobId))
    .limit(1);
  if (!job || !["PENDING_DISPATCH", "DISPATCH_FAILED"].includes(job.dispatchStatus)) {
    return "NOT_ELIGIBLE";
  }
  try {
    await sender.send({
      id: job.eventId,
      name: "gp/ai.research-job.requested",
      data: { jobId: job.id },
    });
  } catch {
    await db
      .update(aiResearchJobs)
      .set({ dispatchStatus: "DISPATCH_FAILED", updatedAt: new Date() })
      .where(
        and(
          eq(aiResearchJobs.id, job.id),
          inArray(aiResearchJobs.dispatchStatus, ["PENDING_DISPATCH", "DISPATCH_FAILED"])
        )
      );
    throw new Error("AI_DISPATCH_FAILED: Research job dispatch failed.");
  }
  await db
    .update(aiResearchJobs)
    .set({ dispatchStatus: "DISPATCHED", updatedAt: new Date() })
    .where(
      and(
        eq(aiResearchJobs.id, job.id),
        inArray(aiResearchJobs.dispatchStatus, ["PENDING_DISPATCH", "DISPATCH_FAILED"])
      )
    );
  return "DISPATCHED";
}

export async function reconcileResearchDispatches(
  sender: ResearchEventSender = defaultSender,
  limit = 20
): Promise<{ selected: number; dispatched: number; failed: number }> {
  const cutoff = new Date(Date.now() - AI_RESEARCH_LIMITS.dispatchStaleAfterMs);
  const selectedIds = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM ai_research_jobs
      WHERE dispatch_status IN ('PENDING_DISPATCH', 'DISPATCH_FAILED')
        AND updated_at < ${cutoff.toISOString()}::timestamptz
      ORDER BY updated_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);
    if (rows.length > 0) {
      await tx
        .update(aiResearchJobs)
        .set({ updatedAt: new Date() })
        .where(
          inArray(
            aiResearchJobs.id,
            rows.map((row) => row.id)
          )
        );
    }
    return rows.map((row) => row.id);
  });
  let dispatched = 0;
  let failed = 0;
  for (const jobId of selectedIds) {
    try {
      if ((await dispatchResearchJob(jobId, sender)) === "DISPATCHED") dispatched += 1;
    } catch {
      failed += 1;
    }
  }
  return { selected: selectedIds.length, dispatched, failed };
}
