import "server-only";

import { serverEnv } from "@/config/server-env";
import { ResearchExecutionError } from "./types";

export const AI_RESEARCH_LIMITS = Object.freeze({
  searchCandidatesPerPhase: 5,
  searchTimeoutMs: 15_000,
  searchMaxResponseBytes: 256 * 1024,
  maxRedirects: 3,
  connectTimeoutMs: 5_000,
  headersTimeoutMs: 10_000,
  bodyTimeoutMs: 15_000,
  maxResponseBytes: 2 * 1024 * 1024,
  maxNormalizedTextCharacters: 32_000,
  maxTotalEvidenceCharacters: 96_000,
  maxPersistedSnippetCharacters: 1_000,
  leaseDurationMs: 5 * 60_000,
  heartbeatIntervalMs: 60_000,
  minimumHostIntervalMs: 2_000,
  dispatchStaleAfterMs: 60_000,
  abandonedAttemptAfterMs: 5 * 60_000,
  robotsMaxBytes: 256 * 1024,
});

export interface ResearchRuntimeConfig {
  /** Primary search provider; null when only the Serper fallback is configured. */
  tavilyApiKey: string | null;
  /** Fallback search provider used when Tavily is missing, out of quota or down. */
  serperApiKey: string | null;
  fetchUserAgent: string;
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized.includes("placeholder") ||
    normalized.includes("changeme") ||
    normalized.includes("change-me") ||
    normalized.includes("replace_me") ||
    normalized.includes("replace_with") ||
    normalized.includes("replace-with") ||
    normalized.includes("your_") ||
    normalized.includes("your-")
  );
}

function isIdentifiableUserAgent(value: string): boolean {
  return /gamerperu/i.test(value) && /(?:contact|https?:\/\/|mailto:)/i.test(value);
}

export function requireResearchRuntimeConfig(
  override?: Partial<ResearchRuntimeConfig>
): ResearchRuntimeConfig {
  const tavilyApiKey = override?.tavilyApiKey ?? serverEnv.TAVILY_API_KEY ?? "";
  const serperApiKey =
    override?.serperApiKey !== undefined ? override.serperApiKey : (serverEnv.SERPER_API_KEY ?? "");
  const fetchUserAgent = override?.fetchUserAgent ?? serverEnv.AI_RESEARCH_FETCH_USER_AGENT ?? "";

  const tavily = tavilyApiKey && !isPlaceholder(tavilyApiKey) ? tavilyApiKey.trim() : null;
  const serper = serperApiKey && !isPlaceholder(serperApiKey) ? serperApiKey.trim() : null;
  if (!tavily && !serper) {
    throw new ResearchExecutionError(
      "AI_SEARCH_CONFIG_MISSING",
      "Tavily search is not configured and there is no Serper fallback."
    );
  }
  if (isPlaceholder(fetchUserAgent) || !isIdentifiableUserAgent(fetchUserAgent)) {
    throw new ResearchExecutionError(
      "AI_SEARCH_CONFIG_MISSING",
      "The research fetch user agent is not configured."
    );
  }

  return { tavilyApiKey: tavily, serperApiKey: serper, fetchUserAgent: fetchUserAgent.trim() };
}

export function requireResearchFetchUserAgent(override?: string): string {
  const fetchUserAgent = override ?? serverEnv.AI_RESEARCH_FETCH_USER_AGENT ?? "";
  if (isPlaceholder(fetchUserAgent) || !isIdentifiableUserAgent(fetchUserAgent)) {
    throw new ResearchExecutionError(
      "AI_SEARCH_CONFIG_MISSING",
      "The research fetch user agent is not configured."
    );
  }
  return fetchUserAgent.trim();
}
