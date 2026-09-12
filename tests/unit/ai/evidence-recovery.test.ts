import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { rehydratePersistedEvidence } from "@/lib/ai/research/evidence-recovery";
import type { PersistedEvidenceSource } from "@/lib/ai/research/source-service";

const fullText = `Recovered evidence ${"x".repeat(2_000)}`;
const digest = createHash("sha256").update(fullText, "utf8").digest("hex");
const source: PersistedEvidenceSource = {
  id: "018f0025-0000-7000-8000-000000000040",
  originalUrl: "https://discovery.example/mouse",
  resolvedUrl: "https://publisher.example/products/mouse",
  title: "Persisted source",
  snippet: fullText.slice(0, 1_000),
  contentSha256: digest,
  retrievalMethod: "SEARCH_API",
  trustTier: "TIER_6_PUBLIC_SUPPORTING",
  trustBasis: "UNVERIFIED_DEFAULT",
  fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function recoveredPage(overrides: Partial<{ resolvedUrl: string; text: string }> = {}) {
  const text = overrides.text ?? fullText;
  return {
    originalUrl: source.resolvedUrl,
    resolvedUrl: overrides.resolvedUrl ?? source.resolvedUrl,
    title: "Current fetched title",
    text,
    snippet: text.slice(0, 1_000),
    contentSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    fetchedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

describe("Persisted evidence recovery", () => {
  it("refetches the exact resolved URL and restores matching full bounded evidence", async () => {
    const fetcher = vi.fn(async () => recoveredPage());
    const evidence = await rehydratePersistedEvidence({
      sources: [source],
      userAgent: "GamerPeruResearchBot/1.0 (contact=test)",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith({
      url: source.resolvedUrl,
      userAgent: "GamerPeruResearchBot/1.0 (contact=test)",
    });
    expect(evidence[0]).toMatchObject({
      sourceId: source.id,
      text: fullText,
      snippet: source.snippet,
      contentSha256: digest,
    });
    expect(evidence[0]!.text).not.toBe(source.snippet);
  });

  it("rejects changed content or a changed resolved destination", async () => {
    await expect(
      rehydratePersistedEvidence({
        sources: [source],
        userAgent: "GamerPeruResearchBot/1.0 (contact=test)",
        fetcher: async () => recoveredPage({ text: `${fullText} changed` }),
      })
    ).rejects.toMatchObject({ code: "AI_EVIDENCE_CHANGED" });
    await expect(
      rehydratePersistedEvidence({
        sources: [source],
        userAgent: "GamerPeruResearchBot/1.0 (contact=test)",
        fetcher: async () => recoveredPage({ resolvedUrl: "https://publisher.example/new" }),
      })
    ).rejects.toMatchObject({ code: "AI_EVIDENCE_CHANGED" });
  });

  it("fails closed when the destination cannot be safely refetched", async () => {
    await expect(
      rehydratePersistedEvidence({
        sources: [source],
        userAgent: "GamerPeruResearchBot/1.0 (contact=test)",
        fetcher: async () => {
          throw new Error("blocked");
        },
      })
    ).rejects.toMatchObject({ code: "AI_EVIDENCE_REHYDRATION_FAILED" });
  });
});
