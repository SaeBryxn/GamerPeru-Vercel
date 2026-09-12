import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiResearchJobItems, aiSources } from "@/db/schema";
import { LeaseLostError, ResearchExecutionError } from "./types";
import type { ExternalProductEvidence } from "./types";
import { isOfficialHostname } from "./url-security";
import { AI_RESEARCH_LIMITS } from "./config";

export function assignSourceTrust(
  resolvedUrl: string,
  canonicalBrandHostname?: string
): Pick<ExternalProductEvidence, "trustTier" | "trustBasis"> {
  if (
    canonicalBrandHostname &&
    isOfficialHostname(new URL(resolvedUrl).hostname, canonicalBrandHostname)
  ) {
    return {
      trustTier: "TIER_1_OFFICIAL_MANUFACTURER",
      trustBasis: "CANONICAL_BRAND_DOMAIN_MATCH",
    };
  }
  return { trustTier: "TIER_6_PUBLIC_SUPPORTING", trustBasis: "UNVERIFIED_DEFAULT" };
}

export async function persistEvidenceSourceSet(
  itemId: string,
  leaseToken: string,
  evidence: ExternalProductEvidence[]
): Promise<Array<{ id: string; snippet: string }>> {
  const totalCharacters = evidence.reduce((total, source) => total + source.text.length, 0);
  if (
    evidence.length === 0 ||
    evidence.length > AI_RESEARCH_LIMITS.searchCandidatesPerPhase ||
    evidence.some(
      (source) =>
        source.text.length === 0 ||
        source.text.length > AI_RESEARCH_LIMITS.maxNormalizedTextCharacters
    ) ||
    totalCharacters > AI_RESEARCH_LIMITS.maxTotalEvidenceCharacters
  ) {
    throw new ResearchExecutionError(
      "AI_FETCH_FAILED",
      "The normalized evidence set is outside the approved bounds."
    );
  }
  return await db.transaction(async (tx) => {
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

    await tx.delete(aiSources).where(eq(aiSources.jobItemId, itemId));
    const sourceIdTimestamp = Date.now();
    const sourceRows = evidence.map((source, sourceIndex) => ({
      id: generateUuidV7(sourceIdTimestamp + sourceIndex),
      jobItemId: itemId,
      originalUrl: source.originalUrl,
      resolvedUrl: source.resolvedUrl,
      providerCitationId: null,
      sourceName: source.title.slice(0, 150),
      retrievalMethod: source.retrievalMethod,
      trustTier: source.trustTier,
      trustBasis: source.trustBasis,
      fetchedAt: source.fetchedAt,
      contentSha256: createHash("sha256").update(source.text, "utf8").digest("hex"),
      fetchStatus: "SUCCESS" as const,
      snippet: source.text.slice(0, AI_RESEARCH_LIMITS.maxPersistedSnippetCharacters),
    }));
    await tx.insert(aiSources).values(sourceRows);

    await tx
      .update(aiResearchJobItems)
      .set({ errorCode: null, errorMessage: null, updatedAt: new Date() })
      .where(
        and(
          eq(aiResearchJobItems.id, itemId),
          eq(aiResearchJobItems.processingLeaseToken, leaseToken),
          gt(aiResearchJobItems.processingLeaseExpiresAt, new Date())
        )
      );
    return sourceRows.map((source) => ({ id: source.id, snippet: source.snippet }));
  });
}

export interface PersistedEvidenceSource {
  id: string;
  originalUrl: string;
  resolvedUrl: string;
  title: string;
  snippet: string;
  contentSha256: string;
  retrievalMethod: "SEARCH_API" | "DIRECT_URL";
  trustTier: ExternalProductEvidence["trustTier"];
  trustBasis: ExternalProductEvidence["trustBasis"];
  fetchedAt: Date;
}

export async function readPersistedSourceLedger(
  itemId: string
): Promise<PersistedEvidenceSource[]> {
  const rows = await db
    .select()
    .from(aiSources)
    .where(eq(aiSources.jobItemId, itemId))
    .orderBy(asc(aiSources.id));
  if (rows.length === 0) return [];
  if (
    rows.some(
      (row) =>
        row.fetchStatus !== "SUCCESS" ||
        !row.originalUrl ||
        !row.resolvedUrl ||
        !row.contentSha256 ||
        row.snippet == null ||
        !["SEARCH_API", "DIRECT_URL"].includes(row.retrievalMethod)
    )
  ) {
    throw new ResearchExecutionError(
      "AI_EVIDENCE_REHYDRATION_FAILED",
      "The persisted evidence ledger cannot be rehydrated safely."
    );
  }
  return rows.map((row) => ({
    id: row.id,
    originalUrl: row.originalUrl!,
    resolvedUrl: row.resolvedUrl!,
    title: row.sourceName,
    snippet: row.snippet!,
    contentSha256: row.contentSha256!,
    retrievalMethod: row.retrievalMethod as "SEARCH_API" | "DIRECT_URL",
    trustTier: row.trustTier as ExternalProductEvidence["trustTier"],
    trustBasis: row.trustBasis as ExternalProductEvidence["trustBasis"],
    fetchedAt: row.fetchedAt,
  }));
}
