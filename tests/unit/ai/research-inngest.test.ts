import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_RESEARCH_LIMITS, requireResearchRuntimeConfig } from "@/lib/ai/research/config";
import { DomainRateLimiter } from "@/lib/ai/research/domain-rate-limiter";

describe("Research configuration and Inngest registration", () => {
  it("centralizes the approved lease, fetch, evidence, and host-rate ceilings", () => {
    expect(AI_RESEARCH_LIMITS).toMatchObject({
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
    });
  });

  it("fails closed for missing/placeholder Tavily keys and unidentified user agents", () => {
    expect(() =>
      requireResearchRuntimeConfig({
        tavilyApiKey: "placeholder_tavily_api_key",
        fetchUserAgent: "GamerPeruResearchBot/1.0 (operations=test)",
      })
    ).toThrow("Tavily search is not configured");
    expect(() =>
      requireResearchRuntimeConfig({
        tavilyApiKey: "tvly-test",
        fetchUserAgent: "generic-browser",
      })
    ).toThrow("fetch user agent");
    expect(() =>
      requireResearchRuntimeConfig({
        tavilyApiKey: "tvly-test",
        fetchUserAgent: "GamerPeruResearchBot/1.0",
      })
    ).toThrow("fetch user agent");
  });

  it("honors the two-second host interval and larger robots delay", async () => {
    const sleeps: number[] = [];
    let now = 10_000;
    const limiter = new DomainRateLimiter(
      async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
      () => now
    );
    await limiter.wait("example.com");
    now += 500;
    await limiter.wait("example.com", 7_000);
    expect(sleeps).toEqual([6_500]);
  });

  it("registers worker, dispatch reconciliation, and lease recovery in the Next route", () => {
    const route = readFileSync(resolve("src/app/api/inngest/route.ts"), "utf8");
    expect(route).toContain("aiResearchJob");
    expect(route).toContain("aiResearchDispatchReconciliation");
    expect(route).toContain("aiResearchLeaseRecovery");

    const worker = readFileSync(resolve("src/lib/inngest/functions/ai-research-job.ts"), "utf8");
    expect(worker).toContain("event: AI_RESEARCH_REQUESTED_EVENT");
    expect(worker).toContain("concurrency: { limit: 1 }");
    expect(worker).not.toMatch(/google_search|workflow_dispatch/);
  });

  it("keeps CHK3 catalog mutation and R2 upload surfaces absent from the research runtime", () => {
    const runtime = readdirSync(resolve("src/lib/ai/research"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(resolve("src/lib/ai/research", name), "utf8"))
      .join("\n");
    expect(runtime).not.toMatch(
      /@aws-sdk|\bR2_(?:ACCOUNT|ACCESS|SECRET)|\b(?:createProduct|updateProduct|createVariant|applyProposal)\s*\(/
    );
  });
});
