import "server-only";

import { z } from "zod";
import { AI_RESEARCH_LIMITS, requireResearchRuntimeConfig } from "./config";
import { ResearchExecutionError } from "./types";
import type { ResearchRuntimeConfig } from "./config";

export const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

export interface TavilySearchRequest {
  query: string;
  topic: "general";
  search_depth: "basic";
  max_results: 5;
  include_answer: false;
  include_raw_content: false;
  include_images: false;
  include_image_descriptions: false;
  include_favicon: false;
  include_usage: false;
  auto_parameters: false;
  safe_search: true;
  include_domains?: [string];
  include_domains_mode?: "filter";
}

export interface TavilyCandidate {
  url: string;
  title: string;
  score: number;
}

const responseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            url: z.string().url().max(2_000),
            title: z.string().trim().max(500),
            score: z.number().finite(),
          })
          .passthrough()
      )
      .max(AI_RESEARCH_LIMITS.searchCandidatesPerPhase),
  })
  .passthrough();

export function buildTavilySearchRequest(
  normalizedQuery: string,
  canonicalHost?: string
): TavilySearchRequest {
  return {
    query: normalizedQuery,
    topic: "general",
    search_depth: "basic",
    max_results: 5,
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_image_descriptions: false,
    include_favicon: false,
    include_usage: false,
    auto_parameters: false,
    safe_search: true,
    ...(canonicalHost
      ? { include_domains: [canonicalHost] as [string], include_domains_mode: "filter" as const }
      : {}),
  };
}

export interface TavilySearchOptions {
  query: string;
  canonicalHost?: string;
  signal?: AbortSignal;
  runtimeConfig?: Partial<ResearchRuntimeConfig>;
  fetchImpl?: typeof fetch;
}

async function readTavilyResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  const expectedBytes = declaredLength === null ? null : Number(declaredLength);
  if (
    expectedBytes !== null &&
    (!Number.isSafeInteger(expectedBytes) ||
      expectedBytes < 0 ||
      expectedBytes > AI_RESEARCH_LIMITS.searchMaxResponseBytes)
  ) {
    throw new ResearchExecutionError(
      "AI_SEARCH_RESPONSE_INVALID",
      "Tavily returned an oversized response."
    );
  }
  if (!response.body) {
    throw new ResearchExecutionError("AI_SEARCH_RESPONSE_INVALID", "Tavily returned no body.");
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > AI_RESEARCH_LIMITS.searchMaxResponseBytes) {
        await reader.cancel();
        throw new ResearchExecutionError(
          "AI_SEARCH_RESPONSE_INVALID",
          "Tavily returned an oversized response."
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ResearchExecutionError) throw error;
    throw new ResearchExecutionError(
      "AI_SEARCH_OUTCOME_UNKNOWN",
      "Tavily response transfer outcome is unknown.",
      true
    );
  } finally {
    reader.releaseLock();
  }
  if (expectedBytes !== null && receivedBytes !== expectedBytes) {
    throw new ResearchExecutionError(
      "AI_SEARCH_OUTCOME_UNKNOWN",
      "Tavily response transfer outcome is unknown.",
      true
    );
  }

  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    receivedBytes
  ).toString("utf8");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ResearchExecutionError(
      "AI_SEARCH_RESPONSE_INVALID",
      "Tavily returned malformed JSON."
    );
  }
}

export async function searchTavily(options: TavilySearchOptions): Promise<TavilyCandidate[]> {
  const runtime = requireResearchRuntimeConfig(options.runtimeConfig);
  const request = buildTavilySearchRequest(options.query, options.canonicalHost);
  const fetchImpl = options.fetchImpl ?? fetch;
  options.signal?.throwIfAborted();
  const timeoutSignal = AbortSignal.timeout(AI_RESEARCH_LIMITS.searchTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetchImpl(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.tavilyApiKey}`,
        "content-type": "application/json",
        "accept-encoding": "identity",
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new ResearchExecutionError(
      "AI_SEARCH_OUTCOME_UNKNOWN",
      "Tavily search outcome is unknown.",
      true
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ResearchExecutionError("AI_SEARCH_AUTH_FAILED", "Tavily authentication failed.");
  }
  if (response.status === 429) {
    throw new ResearchExecutionError("AI_SEARCH_RATE_LIMITED", "Tavily rate limited the request.");
  }
  if (response.status >= 500) {
    throw new ResearchExecutionError("AI_SEARCH_UNAVAILABLE", "Tavily search is unavailable.");
  }
  if (!response.ok) {
    throw new ResearchExecutionError("AI_SEARCH_RESPONSE_INVALID", "Tavily rejected the request.");
  }

  const raw = await readTavilyResponse(response);
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ResearchExecutionError(
      "AI_SEARCH_RESPONSE_INVALID",
      "Tavily returned an invalid response."
    );
  }

  return parsed.data.results
    .map(({ url, title, score }) => ({ url, title, score }))
    .sort((left, right) => right.score - left.score);
}
