import "server-only";

import { createHash } from "node:crypto";
import { AI_RESEARCH_LIMITS } from "./config";
import { researchDomainRateLimiter } from "./domain-rate-limiter";
import type { DomainRateLimiter } from "./domain-rate-limiter";
import { fetchDestination } from "./destination-fetcher";
import { searchWeb } from "./search-acquisition";
import { assignSourceTrust } from "./source-service";
import { ResearchExecutionError } from "./types";
import type { ExternalProductEvidence } from "./types";

export interface SearchEvidenceDependencies {
  search?: typeof searchWeb;
  fetcher?: typeof fetchDestination;
}

async function fetchCandidates(options: {
  candidates: Awaited<ReturnType<typeof searchWeb>>;
  userAgent: string;
  canonicalBrandHostname?: string;
  fetcher: typeof fetchDestination;
  rateLimiter: DomainRateLimiter;
  signal?: AbortSignal;
}): Promise<ExternalProductEvidence[]> {
  const evidence: ExternalProductEvidence[] = [];
  let totalCharacters = 0;
  for (const candidate of options.candidates) {
    try {
      const page = await options.fetcher({
        url: candidate.url,
        userAgent: options.userAgent,
        rateLimiter: options.rateLimiter,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const remaining = AI_RESEARCH_LIMITS.maxTotalEvidenceCharacters - totalCharacters;
      if (remaining <= 0) break;
      if (page.text.length > remaining) break;
      totalCharacters += page.text.length;
      evidence.push({
        ...page,
        contentSha256: createHash("sha256").update(page.text, "utf8").digest("hex"),
        retrievalMethod: "SEARCH_API",
        ...assignSourceTrust(page.resolvedUrl, options.canonicalBrandHostname),
      });
    } catch (error) {
      if (!(error instanceof ResearchExecutionError)) throw error;
    }
  }
  return evidence;
}

export async function acquireSearchEvidence(options: {
  query: string;
  userAgent: string;
  canonicalBrandHostname?: string;
  signal?: AbortSignal;
  dependencies?: SearchEvidenceDependencies;
}): Promise<ExternalProductEvidence[]> {
  const search = options.dependencies?.search ?? searchWeb;
  const fetcher = options.dependencies?.fetcher ?? fetchDestination;
  const rateLimiter = researchDomainRateLimiter;

  if (options.canonicalBrandHostname) {
    const officialCandidates = await search({
      query: options.query,
      canonicalHost: options.canonicalBrandHostname,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const officialEvidence = await fetchCandidates({
      candidates: officialCandidates,
      userAgent: options.userAgent,
      canonicalBrandHostname: options.canonicalBrandHostname,
      fetcher,
      rateLimiter,
      signal: options.signal,
    });
    if (officialEvidence.length > 0) return officialEvidence;
  }

  const candidates = await search({
    query: options.query,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const evidence = await fetchCandidates({
    candidates,
    userAgent: options.userAgent,
    canonicalBrandHostname: options.canonicalBrandHostname,
    fetcher,
    rateLimiter,
    signal: options.signal,
  });
  if (evidence.length === 0) {
    throw new ResearchExecutionError(
      "AI_SEARCH_NO_USABLE_EVIDENCE",
      "Search returned no usable verified evidence."
    );
  }
  return evidence;
}
