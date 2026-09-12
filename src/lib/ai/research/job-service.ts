import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  aiProfiles,
  aiProviders,
  aiResearchJobItems,
  aiResearchJobs,
  auditEvents,
} from "@/db/schema";
import { ForbiddenError, requirePermission } from "@/lib/auth/rbac";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { AI_AUDIT_ACTIONS } from "../audit-actions";
import { createProfileSnapshot } from "../profile-service";
import { createResearchMutationDigest, createResearchRequestFingerprint } from "./idempotency";
import { createResearchJobInputSchema } from "./schemas";
import type { CreateResearchJobInput } from "./schemas";
import type { NormalizedResearchItem } from "./types";

export class ResearchIdempotencyConflictError extends Error {
  readonly code = "AI_IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("AI_IDEMPOTENCY_CONFLICT: mutation ID was already used for a different request.");
    this.name = "ResearchIdempotencyConflictError";
  }
}

export interface ResearchJobCreationResult {
  jobId: string;
  itemIds: string[];
  inngestEventId: string;
  replayed: boolean;
}

async function resolveResearchActor(
  authContext?: VerifiedAuthContextReady
): Promise<VerifiedAuthContextReady> {
  const actor = authContext ?? (await requirePermission("catalog:ai_research"));
  if (!actor.permissions.has("catalog:ai_research")) {
    throw new ForbiddenError("Missing catalog:ai_research permission.");
  }
  return actor;
}

function normalizeItems(
  items: z.infer<typeof createResearchJobInputSchema>["items"]
): NormalizedResearchItem[] {
  return items.map((item) => ({
    query: item.query,
    mode: item.mode,
    targetProductId: item.targetProductId ?? null,
    targetProductVersionSnapshot: item.targetProductVersionSnapshot?.toISOString() ?? null,
  }));
}

export async function createResearchJob(
  rawInput: CreateResearchJobInput,
  options?: { authContext?: VerifiedAuthContextReady }
): Promise<ResearchJobCreationResult> {
  const actor = await resolveResearchActor(options?.authContext);
  const input = createResearchJobInputSchema.parse(rawInput);
  const mutationDigest = createResearchMutationDigest(actor.authUserId, rawInput.mutationRequestId);
  const normalizedItems = normalizeItems(input.items);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${mutationDigest}))`);
    const [existing] = await tx
      .select()
      .from(aiResearchJobs)
      .where(eq(aiResearchJobs.mutationRequestDigest, mutationDigest))
      .limit(1);

    const [profile] = await tx
      .select()
      .from(aiProfiles)
      .where(eq(aiProfiles.id, input.selectedProfileId))
      .limit(1);
    if (!profile || !profile.isEnabled) {
      throw new Error("AI_PROFILE_DISABLED: Selected AI profile is unavailable.");
    }
    const [provider] = await tx
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, profile.providerId))
      .limit(1);
    if (!provider || !provider.isEnabled || provider.providerKey !== "google") {
      throw new Error("AI_PROVIDER_DISABLED: Selected AI provider is unavailable.");
    }

    const profileSnapshot = createProfileSnapshot(profile);
    const jobType = normalizedItems.length === 1 ? "SINGLE" : "BATCH";
    const requestFingerprint = createResearchRequestFingerprint({
      jobType,
      items: normalizedItems,
      selectedProfileId: input.selectedProfileId,
      profileSnapshot,
    });

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ResearchIdempotencyConflictError();
      }
      const existingItems = await tx
        .select({ id: aiResearchJobItems.id })
        .from(aiResearchJobItems)
        .where(eq(aiResearchJobItems.jobId, existing.id))
        .orderBy(asc(aiResearchJobItems.itemIndex));
      return {
        jobId: existing.id,
        itemIds: existingItems.map((item) => item.id),
        inngestEventId: existing.inngestEventId,
        replayed: true,
      };
    }

    const jobId = generateUuidV7();
    const inngestEventId = `gp-ai-job-${jobId}`;
    await tx.insert(aiResearchJobs).values({
      id: jobId,
      mutationRequestDigest: mutationDigest,
      requestFingerprint,
      selectedProfileId: input.selectedProfileId,
      profileSnapshot,
      jobType,
      status: "QUEUED",
      dispatchStatus: "PENDING_DISPATCH",
      inngestEventId,
      totalItems: normalizedItems.length,
      completedItems: 0,
      failedItems: 0,
      createdByAuthUserId: actor.authUserId,
    });
    const itemIds = normalizedItems.map(() => generateUuidV7());
    await tx.insert(aiResearchJobItems).values(
      normalizedItems.map((item, itemIndex) => ({
        id: itemIds[itemIndex]!,
        jobId,
        itemIndex,
        inputQuery: item.query,
        mode: item.mode,
        targetProductId: item.targetProductId,
        targetProductVersionSnapshot: item.targetProductVersionSnapshot
          ? new Date(item.targetProductVersionSnapshot)
          : null,
        identityStatus: "PENDING",
        status: "PENDING",
      }))
    );
    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: actor.authUserId,
      action: AI_AUDIT_ACTIONS.AI_RESEARCH_JOB_CREATED,
      targetType: "ai_research_job",
      targetId: jobId,
      metadata: {
        job_type: jobType,
        item_count: normalizedItems.length,
        selected_profile_id: input.selectedProfileId,
      },
      requestId: null,
    });
    return { jobId, itemIds, inngestEventId, replayed: false };
  });
}
