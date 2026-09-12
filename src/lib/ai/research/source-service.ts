import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { aiResearchJobItems, aiSources } from "@/db/schema";
import { LeaseLostError } from "./types";
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
    const sourceRows = evidence.map((source) => ({
      id: generateUuidV7(),
      jobItemId: itemId,
      originalUrl: source.originalUrl,
      resolvedUrl: source.resolvedUrl,
      providerCitationId: null,
      sourceName: source.title.slice(0, 150),
      retrievalMethod: source.retrievalMethod,
      trustTier: source.trustTier,
      trustBasis: source.trustBasis,
      fetchedAt: source.fetchedAt,
      contentSha256: source.contentSha256,
      fetchStatus: "SUCCESS" as const,
      snippet: source.snippet.slice(0, AI_RESEARCH_LIMITS.maxPersistedSnippetCharacters),
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

export async function readPersistedEvidence(itemId: string): Promise<ExternalProductEvidence[]> {
  const rows = await db.select().from(aiSources).where(eq(aiSources.jobItemId, itemId));
  return rows
    .filter(
      (row) =>
        row.fetchStatus === "SUCCESS" &&
        row.originalUrl &&
        row.resolvedUrl &&
        row.contentSha256 &&
        row.snippet
    )
    .map((row) => ({
      sourceId: row.id,
      originalUrl: row.originalUrl!,
      resolvedUrl: row.resolvedUrl!,
      title: row.sourceName,
      text: row.snippet!,
      snippet: row.snippet!,
      contentSha256: row.contentSha256!,
      retrievalMethod: row.retrievalMethod as "SEARCH_API" | "DIRECT_URL",
      trustTier: row.trustTier as ExternalProductEvidence["trustTier"],
      trustBasis: row.trustBasis as ExternalProductEvidence["trustBasis"],
      fetchedAt: row.fetchedAt,
    }));
}
