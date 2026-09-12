import "server-only";

import { createHash } from "node:crypto";
import { fetchDestination } from "./destination-fetcher";
import type { DestinationFetchResult } from "./destination-fetcher";
import { AI_RESEARCH_LIMITS } from "./config";
import type { PersistedEvidenceSource } from "./source-service";
import { ResearchExecutionError } from "./types";
import type { ExternalProductEvidence } from "./types";

export async function rehydratePersistedEvidence(options: {
  sources: PersistedEvidenceSource[];
  userAgent: string;
  signal?: AbortSignal;
  fetcher?: typeof fetchDestination;
}): Promise<ExternalProductEvidence[]> {
  const fetcher = options.fetcher ?? fetchDestination;
  if (
    options.sources.length === 0 ||
    options.sources.length > AI_RESEARCH_LIMITS.searchCandidatesPerPhase
  ) {
    throw new ResearchExecutionError(
      "AI_EVIDENCE_REHYDRATION_FAILED",
      "The persisted evidence ledger is outside the approved bounds."
    );
  }
  const evidence: ExternalProductEvidence[] = [];
  let totalCharacters = 0;
  for (const source of options.sources) {
    let recovered: DestinationFetchResult;
    try {
      recovered = await fetcher({
        url: source.resolvedUrl,
        userAgent: options.userAgent,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch {
      throw new ResearchExecutionError(
        "AI_EVIDENCE_REHYDRATION_FAILED",
        "Persisted evidence could not be fetched again safely."
      );
    }
    const recoveredContentSha256 = createHash("sha256")
      .update(recovered.text, "utf8")
      .digest("hex");
    totalCharacters += recovered.text.length;
    if (
      recovered.text.length === 0 ||
      recovered.text.length > AI_RESEARCH_LIMITS.maxNormalizedTextCharacters ||
      totalCharacters > AI_RESEARCH_LIMITS.maxTotalEvidenceCharacters
    ) {
      throw new ResearchExecutionError(
        "AI_EVIDENCE_REHYDRATION_FAILED",
        "Recovered evidence is outside the approved bounds."
      );
    }
    if (
      recovered.resolvedUrl !== source.resolvedUrl ||
      recoveredContentSha256 !== source.contentSha256
    ) {
      throw new ResearchExecutionError(
        "AI_EVIDENCE_CHANGED",
        "Persisted evidence changed before provider execution."
      );
    }
    evidence.push({
      sourceId: source.id,
      originalUrl: source.originalUrl,
      resolvedUrl: source.resolvedUrl,
      title: source.title,
      text: recovered.text,
      snippet: source.snippet,
      contentSha256: source.contentSha256,
      retrievalMethod: source.retrievalMethod,
      trustTier: source.trustTier,
      trustBasis: source.trustBasis,
      fetchedAt: source.fetchedAt,
    });
  }
  return evidence;
}
