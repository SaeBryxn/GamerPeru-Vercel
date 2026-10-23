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
  products,
} from "@/db/schema";
import { ForbiddenError, requirePermission } from "@/lib/auth/rbac";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { AI_AUDIT_ACTIONS } from "../audit-actions";
import { createProfileSnapshot } from "../profile-service";
import { RESEARCH_PROVIDER_KEYS } from "../gateway/registry";
import { createResearchMutationDigest, createResearchRequestFingerprint } from "./idempotency";
import { createResearchJobInputSchema, profileSnapshotSchema } from "./schemas";
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

type ParsedResearchItem = z.infer<typeof createResearchJobInputSchema>["items"][number];

interface CommittedResearchItem {
  id: string;
  query: string;
  mode: "CREATE" | "ENRICH";
  targetProductId: string | null;
  targetProductVersionSnapshot: Date | null;
}

function parseCommittedMode(value: string): "CREATE" | "ENRICH" {
  if (value === "CREATE" || value === "ENRICH") return value;
  throw new ResearchIdempotencyConflictError();
}

function parseCommittedJobType(value: string): "SINGLE" | "BATCH" {
  if (value === "SINGLE" || value === "BATCH") return value;
  throw new ResearchIdempotencyConflictError();
}

function normalizeCommittedItems(items: CommittedResearchItem[]): NormalizedResearchItem[] {
  return items.map((item) => ({
    query: item.query,
    mode: item.mode,
    targetProductId: item.targetProductId,
    targetProductVersionSnapshot: item.targetProductVersionSnapshot?.toISOString() ?? null,
  }));
}

function normalizeReplayItems(
  items: ParsedResearchItem[],
  committedItems: CommittedResearchItem[]
): NormalizedResearchItem[] {
  return items.map((item, index) => ({
    query: item.query,
    mode: item.mode,
    targetProductId: item.targetProductId ?? null,
    targetProductVersionSnapshot:
      item.mode === "ENRICH"
        ? (committedItems[index]?.targetProductVersionSnapshot?.toISOString() ?? null)
        : null,
  }));
}

async function normalizeNewItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  items: ParsedResearchItem[]
): Promise<NormalizedResearchItem[]> {
  const normalized: NormalizedResearchItem[] = [];
  for (const item of items) {
    if (item.mode === "CREATE") {
      normalized.push({
        query: item.query,
        mode: item.mode,
        targetProductId: null,
        targetProductVersionSnapshot: null,
      });
      continue;
    }

    const [product] = await tx
      .select({ id: products.id, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, item.targetProductId!))
      .limit(1)
      .for("share");
    if (!product) {
      throw new Error("AI_TARGET_PRODUCT_NOT_FOUND: ENRICH target product does not exist.");
    }
    normalized.push({
      query: item.query,
      mode: item.mode,
      targetProductId: product.id,
      targetProductVersionSnapshot: product.updatedAt.toISOString(),
    });
  }
  return normalized;
}

export async function createResearchJob(
  rawInput: CreateResearchJobInput,
  options?: { authContext?: VerifiedAuthContextReady }
): Promise<ResearchJobCreationResult> {
  const actor = await resolveResearchActor(options?.authContext);
  const input = createResearchJobInputSchema.parse(rawInput);
  const mutationDigest = createResearchMutationDigest(actor.authUserId, rawInput.mutationRequestId);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${mutationDigest}))`);
    const [existing] = await tx
      .select()
      .from(aiResearchJobs)
      .where(eq(aiResearchJobs.mutationRequestDigest, mutationDigest))
      .limit(1);

    if (existing) {
      const existingItems = await tx
        .select({
          id: aiResearchJobItems.id,
          query: aiResearchJobItems.inputQuery,
          mode: aiResearchJobItems.mode,
          targetProductId: aiResearchJobItems.targetProductId,
          targetProductVersionSnapshot: aiResearchJobItems.targetProductVersionSnapshot,
        })
        .from(aiResearchJobItems)
        .where(eq(aiResearchJobItems.jobId, existing.id))
        .orderBy(asc(aiResearchJobItems.itemIndex));
      const profileSnapshot = profileSnapshotSchema.parse(existing.profileSnapshot);
      const jobType = input.items.length === 1 ? "SINGLE" : "BATCH";
      const committedNormalizedItems = normalizeCommittedItems(
        existingItems.map((item) => ({ ...item, mode: parseCommittedMode(item.mode) }))
      );
      const committedFingerprint = createResearchRequestFingerprint({
        jobType: parseCommittedJobType(existing.jobType),
        items: committedNormalizedItems,
        profileSnapshot,
      });
      const replayFingerprint = createResearchRequestFingerprint({
        jobType,
        items: normalizeReplayItems(
          input.items,
          existingItems.map((item) => ({ ...item, mode: parseCommittedMode(item.mode) }))
        ),
        profileSnapshot,
      });
      if (
        input.selectedProfileId !== existing.selectedProfileId ||
        existing.requestFingerprint !== committedFingerprint ||
        existing.requestFingerprint !== replayFingerprint
      ) {
        throw new ResearchIdempotencyConflictError();
      }
      return {
        jobId: existing.id,
        itemIds: existingItems.map((item) => item.id),
        inngestEventId: existing.inngestEventId,
        replayed: true,
      };
    }

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
    if (
      !provider ||
      !provider.isEnabled ||
      !(RESEARCH_PROVIDER_KEYS as readonly string[]).includes(provider.providerKey)
    ) {
      throw new Error("AI_PROVIDER_DISABLED: Selected AI provider is unavailable.");
    }

    const profileSnapshot = createProfileSnapshot(profile);
    const normalizedItems = await normalizeNewItems(tx, input.items);
    const jobType = normalizedItems.length === 1 ? "SINGLE" : "BATCH";
    const requestFingerprint = createResearchRequestFingerprint({
      jobType,
      items: normalizedItems,
      profileSnapshot,
    });

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
