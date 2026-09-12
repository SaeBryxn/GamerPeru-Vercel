import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiProviderAttempts, aiResearchJobItems } from "@/db/schema";
import { AiGatewayError } from "../gateway/types";
import type { AiStructuredGenerationResult, AiUsageMetadata } from "../gateway/types";
import type { ResearchProfileSnapshot } from "./types";
import { LeaseLostError } from "./types";

export type AiOperationType = "IDENTITY_RESOLUTION" | "SPEC_EXTRACTION" | "COPY_GENERATION";

export interface ProviderAttemptContext {
  itemId: string;
  leaseToken: string;
  profileId: string;
  snapshot: ResearchProfileSnapshot;
  operationType: AiOperationType;
  requestDigest: string;
}

async function assertLeaseInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
  leaseToken: string
): Promise<void> {
  const [owned] = await tx
    .update(aiResearchJobItems)
    .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(aiResearchJobItems.id, itemId),
        eq(aiResearchJobItems.processingLeaseToken, leaseToken),
        gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
      )
    )
    .returning({ id: aiResearchJobItems.id });
  if (!owned) throw new LeaseLostError();
}

export async function createProviderAttempt(context: ProviderAttemptContext): Promise<string> {
  return await db.transaction(async (tx) => {
    await assertLeaseInTransaction(tx, context.itemId, context.leaseToken);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${context.itemId}:${context.operationType}`}))`
    );
    const [ordinalRow] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${aiProviderAttempts.attemptOrdinal}), 0) + 1` })
      .from(aiProviderAttempts)
      .where(
        and(
          eq(aiProviderAttempts.jobItemId, context.itemId),
          eq(aiProviderAttempts.operationType, context.operationType)
        )
      );
    const id = generateUuidV7();
    await tx.insert(aiProviderAttempts).values({
      id,
      jobItemId: context.itemId,
      providerId: context.snapshot.providerId,
      modelId: context.snapshot.modelId,
      profileId: context.profileId,
      profileKey: context.snapshot.profileKey,
      temperature: context.snapshot.temperature.toFixed(2),
      maxTokens: context.snapshot.maxTokens,
      operationType: context.operationType,
      attemptOrdinal: Number(ordinalRow?.next ?? 1),
      requestDigest: context.requestDigest,
      startedAt: new Date(),
      status: "RUNNING",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costSource: "UNAVAILABLE",
      costMicros: null,
      currency: null,
    });
    return id;
  });
}

async function finalizeAttempt(
  context: ProviderAttemptContext,
  attemptId: string,
  input: {
    status: "COMPLETED" | "FAILED" | "RATE_LIMITED" | "UNKNOWN";
    providerRequestId: string | null;
    usage?: AiUsageMetadata;
    errorCode?: string;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertLeaseInTransaction(tx, context.itemId, context.leaseToken);
    await tx
      .update(aiProviderAttempts)
      .set({
        status: input.status,
        providerRequestId: input.providerRequestId,
        completedAt: new Date(),
        errorCode: input.errorCode ?? null,
        errorMessage: null,
        inputTokens: input.usage?.inputTokens ?? 0,
        outputTokens: input.usage?.outputTokens ?? 0,
        totalTokens: input.usage?.totalTokens ?? 0,
        costSource: input.usage?.costSource ?? "UNAVAILABLE",
        costMicros: input.usage?.costMicros ?? null,
        currency: input.usage?.currency ?? null,
        pricingVersion: input.usage?.pricingVersion,
        pricingEffectiveAt: input.usage?.pricingEffectiveAt,
      })
      .where(and(eq(aiProviderAttempts.id, attemptId), eq(aiProviderAttempts.status, "RUNNING")));
  });
}

export async function runProviderAttempt(
  context: ProviderAttemptContext,
  execute: () => Promise<AiStructuredGenerationResult>
): Promise<AiStructuredGenerationResult> {
  const attemptId = await createProviderAttempt(context);
  try {
    const result = await execute();
    await finalizeAttempt(context, attemptId, {
      status: "COMPLETED",
      providerRequestId: result.providerRequestId,
      usage: result.usage,
    });
    return result;
  } catch (error) {
    const gatewayError = error instanceof AiGatewayError ? error : null;
    await finalizeAttempt(context, attemptId, {
      status:
        gatewayError?.code === "AI_PROVIDER_RATE_LIMITED"
          ? "RATE_LIMITED"
          : gatewayError?.outcomeAmbiguous
            ? "UNKNOWN"
            : "FAILED",
      providerRequestId: null,
      errorCode: gatewayError?.code ?? "AI_PROVIDER_RESPONSE_INVALID",
    });
    throw error;
  }
}
