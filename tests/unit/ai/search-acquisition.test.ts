import { describe, expect, it, vi } from "vitest";
import {
  buildTavilySearchRequest,
  searchTavily,
  TAVILY_SEARCH_ENDPOINT,
} from "@/lib/ai/research/search-acquisition";
import { acquireSearchEvidence } from "@/lib/ai/research/search-evidence";
import { ResearchExecutionError } from "@/lib/ai/research/types";

const runtimeConfig = {
  tavilyApiKey: "tvly-unit-test-secret",
  fetchUserAgent: "GamerPeruResearchBot/1.0 (operations-contact=test)",
};

describe("Tavily source discovery", () => {
  it("builds the exact narrow baseline and canonical filter request", () => {
    expect(buildTavilySearchRequest("Logitech G Pro X")).toEqual({
      query: "Logitech G Pro X",
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
    });
    expect(buildTavilySearchRequest("Logitech G Pro X", "logitech.com")).toMatchObject({
      include_domains: ["logitech.com"],
      include_domains_mode: "filter",
    });
  });

  it("uses bearer auth and accepts only url/title/score while discarding Tavily content", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answer: "discard",
            request_id: "discard",
            results: [
              {
                url: "https://example.com/product",
                title: "Product",
                score: 0.91,
                content: "discard-content",
                raw_content: "discard-raw",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const result = await searchTavily({
      query: "Product",
      canonicalHost: "example.com",
      runtimeConfig,
      fetchImpl,
    });
    expect(result).toEqual([{ url: "https://example.com/product", title: "Product", score: 0.91 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      TAVILY_SEARCH_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer tvly-unit-test-secret",
          "content-type": "application/json",
          "accept-encoding": "identity",
        },
      })
    );
    expect(JSON.stringify(result)).not.toContain("discard");
  });

  it.each([
    [401, "AI_SEARCH_AUTH_FAILED"],
    [403, "AI_SEARCH_AUTH_FAILED"],
    [429, "AI_SEARCH_RATE_LIMITED"],
    [503, "AI_SEARCH_UNAVAILABLE"],
  ])("maps Tavily status %s to %s without exposing response bodies", async (status, code) => {
    const promise = searchTavily({
      query: "Product",
      runtimeConfig,
      fetchImpl: vi.fn(async () => new Response("upstream secret body", { status })),
    });
    await expect(promise).rejects.toMatchObject({ code });
    await expect(promise).rejects.not.toThrow("upstream secret body");
  });

  it("rejects malformed responses and treats network completion as ambiguous", async () => {
    await expect(
      searchTavily({
        query: "Product",
        runtimeConfig,
        fetchImpl: vi.fn(async () => new Response('{"results":[{"url":4}]}', { status: 200 })),
      })
    ).rejects.toMatchObject({ code: "AI_SEARCH_RESPONSE_INVALID" });
    await expect(
      searchTavily({
        query: "Product",
        runtimeConfig,
        fetchImpl: vi.fn(async () => Promise.reject(new Error("timeout after send"))),
      })
    ).rejects.toMatchObject({ code: "AI_SEARCH_OUTCOME_UNKNOWN", outcomeAmbiguous: true });
  });

  it("bounds response transfer and treats truncated bodies as ambiguous", async () => {
    await expect(
      searchTavily({
        query: "Product",
        runtimeConfig,
        fetchImpl: vi.fn(
          async () =>
            new Response("{}", {
              status: 200,
              headers: { "content-length": String(256 * 1024 + 1) },
            })
        ),
      })
    ).rejects.toMatchObject({ code: "AI_SEARCH_RESPONSE_INVALID" });
    await expect(
      searchTavily({
        query: "Product",
        runtimeConfig,
        fetchImpl: vi.fn(
          async () => new Response("{}", { status: 200, headers: { "content-length": "100" } })
        ),
      })
    ).rejects.toMatchObject({ code: "AI_SEARCH_OUTCOME_UNKNOWN", outcomeAmbiguous: true });
  });

  it("runs canonical-domain first and general only after zero usable evidence", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([{ url: "https://brand.example/blocked", title: "Blocked", score: 1 }])
      .mockResolvedValueOnce([{ url: "https://retailer.example/item", title: "Item", score: 0.5 }]);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(
        new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Publisher denied access.")
      )
      .mockResolvedValueOnce({
        originalUrl: "https://retailer.example/item",
        resolvedUrl: "https://retailer.example/item",
        title: "Item",
        text: "usable evidence",
        snippet: "usable evidence",
        contentSha256: "a".repeat(64),
        fetchedAt: new Date(),
      });
    const evidence = await acquireSearchEvidence({
      query: "Product",
      userAgent: runtimeConfig.fetchUserAgent,
      canonicalBrandHostname: "brand.example",
      dependencies: { search, fetcher },
    });
    expect(search).toHaveBeenNthCalledWith(1, {
      query: "Product",
      canonicalHost: "brand.example",
    });
    expect(search).toHaveBeenNthCalledWith(2, { query: "Product" });
    expect(evidence[0]!.trustTier).toBe("TIER_6_PUBLIC_SUPPORTING");
  });

  it("does not invoke a general phase when official evidence is usable", async () => {
    const search = vi.fn(async () => [
      { url: "https://brand.example/item", title: "Item", score: 1 },
    ]);
    const fetcher = vi.fn(async () => ({
      originalUrl: "https://brand.example/item",
      resolvedUrl: "https://brand.example/item",
      title: "Item",
      text: "official evidence",
      snippet: "official evidence",
      contentSha256: "b".repeat(64),
      fetchedAt: new Date(),
    }));
    const evidence = await acquireSearchEvidence({
      query: "Product",
      userAgent: runtimeConfig.fetchUserAgent,
      canonicalBrandHostname: "brand.example",
      dependencies: { search, fetcher },
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(evidence[0]!.trustBasis).toBe("CANONICAL_BRAND_DOMAIN_MATCH");
  });
});
