import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import {
  aiProductProposals,
  aiProposalFieldReviews,
  aiProposalFieldSources,
  aiResearchJobItems,
  aiSources,
} from "@/db/schema";
import type { CopyGeneration, IdentityResolution, SpecificationExtraction } from "./schemas";
import { storePageReviewFields } from "./schemas";
import { researchJobCounterUpdate } from "./lease-service";
import { LeaseLostError } from "./types";

export function toDraftSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 190);
  return slug || `ai-draft-${generateUuidV7()}`;
}

export function assertOriginalCopy(copy: CopyGeneration, evidenceTexts: string[]): void {
  const generated = [copy.subtitle, copy.description, copy.seoDescription]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (
    /(?:s\/?\.?|usd|us\$|\$)\s*\d|\b(?:price|precio|cost|costo|stock|inventario)\b\s*[:=-]?\s*\d/i.test(
      generated
    )
  ) {
    throw new Error("AI_COPY_COMMERCE_AUTHORITY_FORBIDDEN");
  }
  for (const evidence of evidenceTexts) {
    const words = evidence.toLowerCase().replace(/\s+/g, " ").trim().split(" ");
    for (let index = 0; index + 15 <= words.length; index += 1) {
      const passage = words.slice(index, index + 15).join(" ");
      if (passage.length >= 100 && generated.includes(passage)) {
        throw new Error("AI_COPY_VERBATIM_EVIDENCE");
      }
    }
  }
}

export async function publishDraftProposal(options: {
  itemId: string;
  leaseToken: string;
  identity: IdentityResolution;
  extraction: SpecificationExtraction;
  copy: CopyGeneration;
  sourceIds: string[];
}): Promise<{ proposalId: string; itemStatus: "READY_FOR_REVIEW" | "SOURCE_CONFLICT" }> {
  return await db.transaction(async (tx) => {
    const [owned] = await tx
      .update(aiResearchJobItems)
      .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(aiResearchJobItems.id, options.itemId),
          eq(aiResearchJobItems.processingLeaseToken, options.leaseToken),
          gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
        )
      )
      .returning({ id: aiResearchJobItems.id });
    if (!owned) throw new LeaseLostError();

    const sourceRows = options.sourceIds.map((id) => ({ id }));
    if (sourceRows.length === 0) throw new Error("AI_PROVIDER_RESPONSE_INVALID");
    if (new Set(options.sourceIds).size !== options.sourceIds.length) {
      throw new Error("AI_PROVIDER_RESPONSE_INVALID");
    }
    const ownedSources = await tx
      .select({ id: aiSources.id })
      .from(aiSources)
      .where(
        and(eq(aiSources.jobItemId, options.itemId), inArray(aiSources.id, options.sourceIds))
      );
    if (ownedSources.length !== sourceRows.length) {
      throw new Error("AI_PROVIDER_RESPONSE_INVALID");
    }
    const specifications = [
      ...options.extraction.specifications,
      ...storePageReviewFields(options.extraction.storePage).map((field) => ({
        ...field,
        value: field.proposedValue,
        conflictingValues: [] as Array<{ value: unknown; sourceIndexes: number[] }>,
      })),
    ];
    const invalidSourceIndex = specifications.some((specification) =>
      [
        ...specification.sourceIndexes,
        ...specification.conflictingValues.flatMap((item) => item.sourceIndexes),
      ].some((index) => !sourceRows[index])
    );
    if (invalidSourceIndex) throw new Error("AI_PROVIDER_RESPONSE_INVALID");

    const [existing] = await tx
      .select({ id: aiProductProposals.id, status: aiProductProposals.status })
      .from(aiProductProposals)
      .where(eq(aiProductProposals.jobItemId, options.itemId))
      .limit(1);
    if (existing && existing.status !== "DRAFT") {
      throw new Error("AI_PROPOSAL_NOT_DRAFT");
    }
    const proposalId = existing?.id ?? generateUuidV7();
    const values = {
      proposedName: options.copy.name,
      proposedSlug: toDraftSlug(options.copy.name),
      proposedSubtitle: options.copy.subtitle,
      proposedDescription: options.copy.description,
      proposedSpecifications: Object.fromEntries(
        specifications.map((specification) => [specification.fieldPath, specification.value])
      ),
      unmappedSpecifications: options.extraction.unmappedSpecifications,
      proposedVariants: options.extraction.variants,
      proposedSeoDraft: {
        title: options.copy.seoTitle,
        description: options.copy.seoDescription,
      },
      mediaCandidates: options.extraction.mediaCandidates,
      status: "DRAFT",
      updatedAt: new Date(),
    } as const;
    if (existing) {
      await tx.update(aiProductProposals).set(values).where(eq(aiProductProposals.id, proposalId));
      const reviews = await tx
        .select({ id: aiProposalFieldReviews.id })
        .from(aiProposalFieldReviews)
        .where(eq(aiProposalFieldReviews.proposalId, proposalId));
      if (reviews.length > 0) {
        await tx.delete(aiProposalFieldSources).where(
          inArray(
            aiProposalFieldSources.fieldReviewId,
            reviews.map((review) => review.id)
          )
        );
      }
      await tx
        .delete(aiProposalFieldReviews)
        .where(eq(aiProposalFieldReviews.proposalId, proposalId));
    } else {
      await tx
        .insert(aiProductProposals)
        .values({ id: proposalId, jobItemId: options.itemId, ...values });
    }

    let hasConflicts = false;
    for (const specification of specifications) {
      const reviewId = generateUuidV7();
      const conflictDetails = specification.conflictingValues.length
        ? { competingValues: specification.conflictingValues }
        : null;
      hasConflicts ||= Boolean(conflictDetails);
      await tx.insert(aiProposalFieldReviews).values({
        id: reviewId,
        proposalId,
        fieldPath: specification.fieldPath,
        proposedValue: specification.value,
        decision: "PENDING",
        verificationState: conflictDetails ? "SOURCE_CONFLICT" : "AI_INFERRED",
        conflictDetails,
      });
      await tx.insert(aiProposalFieldSources).values([
        ...specification.sourceIndexes.map((index) => ({
          id: generateUuidV7(),
          fieldReviewId: reviewId,
          sourceId: sourceRows[index]!.id,
          relationship: "SUPPORTS",
          sourceValue: specification.value,
        })),
        ...specification.conflictingValues.flatMap((conflict) =>
          conflict.sourceIndexes.map((index) => ({
            id: generateUuidV7(),
            fieldReviewId: reviewId,
            sourceId: sourceRows[index]!.id,
            relationship: "CONFLICTS",
            sourceValue: conflict.value,
          }))
        ),
      ]);
    }

    const contextualFields: Array<{ fieldPath: string; proposedValue: unknown }> = [
      { fieldPath: "copy.name", proposedValue: options.copy.name },
      ...(options.copy.subtitle
        ? [{ fieldPath: "copy.subtitle", proposedValue: options.copy.subtitle }]
        : []),
      ...(options.copy.description
        ? [{ fieldPath: "copy.description", proposedValue: options.copy.description }]
        : []),
      ...(options.copy.seoTitle
        ? [{ fieldPath: "seo.title", proposedValue: options.copy.seoTitle }]
        : []),
      ...(options.copy.seoDescription
        ? [{ fieldPath: "seo.description", proposedValue: options.copy.seoDescription }]
        : []),
      ...(Object.keys(options.extraction.unmappedSpecifications).length > 0
        ? [
            {
              fieldPath: "research.unmappedSpecifications",
              proposedValue: options.extraction.unmappedSpecifications,
            },
          ]
        : []),
      ...(options.extraction.variants.length > 0
        ? [{ fieldPath: "research.variants", proposedValue: options.extraction.variants }]
        : []),
      ...(options.extraction.mediaCandidates.length > 0
        ? [
            {
              fieldPath: "research.mediaCandidates",
              proposedValue: options.extraction.mediaCandidates,
            },
          ]
        : []),
    ];
    for (const field of contextualFields) {
      const reviewId = generateUuidV7();
      await tx.insert(aiProposalFieldReviews).values({
        id: reviewId,
        proposalId,
        fieldPath: field.fieldPath,
        proposedValue: field.proposedValue,
        decision: "PENDING",
        verificationState: "AI_INFERRED",
        conflictDetails: null,
      });
      await tx.insert(aiProposalFieldSources).values(
        sourceRows.map((source) => ({
          id: generateUuidV7(),
          fieldReviewId: reviewId,
          sourceId: source.id,
          relationship: "CONTEXT_ONLY" as const,
          sourceValue: null,
        }))
      );
    }

    const itemStatus = hasConflicts ? "SOURCE_CONFLICT" : "READY_FOR_REVIEW";
    const [finished] = await tx
      .update(aiResearchJobItems)
      .set({
        identityStatus: options.identity.status,
        status: itemStatus,
        errorCode: null,
        errorMessage: null,
        processingLeaseToken: null,
        processingLeaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiResearchJobItems.id, options.itemId),
          eq(aiResearchJobItems.processingLeaseToken, options.leaseToken),
          gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
        )
      )
      .returning({ id: aiResearchJobItems.id, jobId: aiResearchJobItems.jobId });
    if (!finished) throw new LeaseLostError();
    await tx.execute(researchJobCounterUpdate(finished.jobId));
    return { proposalId, itemStatus };
  });
}
