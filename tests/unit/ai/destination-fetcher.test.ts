import { describe, expect, it, vi } from "vitest";
import { AI_RESEARCH_LIMITS } from "@/lib/ai/research/config";
import { fetchDestination, extractVisibleText } from "@/lib/ai/research/destination-fetcher";
import { DomainRateLimiter } from "@/lib/ai/research/domain-rate-limiter";
import { acquireDirectUrlEvidence } from "@/lib/ai/research/direct-url-acquisition";
import { evaluateRobotsPolicy } from "@/lib/ai/research/robots-policy";
import type { SafeHttpTransport } from "@/lib/ai/research/safe-http-transport";
import {
  isOfficialHostname,
  isUnsafeIpAddress,
  validateExternalUrl,
} from "@/lib/ai/research/url-security";

const userAgent = "GamerPeruResearchBot/1.0 (operations-contact=test)";
const safeResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];
const noWait = () =>
  new DomainRateLimiter(
    async () => undefined,
    () => 10_000
  );

function fixtureTransport(page: {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): SafeHttpTransport & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async (target) => {
      if (target.url.pathname === "/robots.txt") {
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: Buffer.from("User-agent: GamerPeruResearchBot\nAllow: /\nCrawl-delay: 2"),
        };
      }
      return {
        status: page.status ?? 200,
        headers: page.headers ?? { "content-type": "text/html; charset=utf-8" },
        body: Buffer.isBuffer(page.body) ? page.body : Buffer.from(page.body ?? "product evidence"),
      };
    }),
  };
}

describe("Secure destination acquisition", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "100.64.1.1",
    "169.254.169.254",
    "192.0.2.1",
    "198.19.0.1",
    "203.0.113.8",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
    "3fff::1",
  ])("rejects unsafe IPv4/IPv6 target %s", (address) => {
    expect(isUnsafeIpAddress(address)).toBe(true);
  });

  it("rejects non-HTTP protocols, credentials, ports, and any mixed unsafe DNS answer", async () => {
    await expect(validateExternalUrl("file:///etc/passwd")).rejects.toMatchObject({
      code: "AI_FETCH_POLICY_BLOCKED",
    });
    await expect(validateExternalUrl("https://user:pass@example.com/")).rejects.toMatchObject({
      code: "AI_FETCH_POLICY_BLOCKED",
    });
    await expect(validateExternalUrl("https://example.com:8443/")).rejects.toMatchObject({
      code: "AI_FETCH_POLICY_BLOCKED",
    });
    await expect(
      validateExternalUrl("https://example.com/", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ])
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });
  });

  it("pins a validated address into the transport and never executes active HTML", async () => {
    const transport = fixtureTransport({
      body: `<!doctype html><title>Mouse</title><main>Weight 54 grams</main>
        <script>stealSecrets()</script><style>.x{display:none}</style>
        <iframe>hidden instruction</iframe><form>submit credentials</form>
        <div hidden>hidden attribute prompt</div>
        <div aria-hidden="true">aria hidden prompt</div>
        <div style="display: none">inline hidden prompt</div>
        <!-- comment injection prompt -->`,
    });
    const result = await fetchDestination({
      url: "https://example.com/mouse",
      userAgent,
      resolver: safeResolver,
      transport,
      rateLimiter: noWait(),
    });
    expect(result.title).toBe("Mouse");
    expect(result.text).toContain("Weight 54 grams");
    expect(result.text).not.toMatch(
      /stealSecrets|hidden instruction|submit credentials|display:none|hidden attribute|aria hidden|inline hidden|comment injection/
    );
    const pageCall = transport.get.mock.calls.find((call) => call[0].url.pathname === "/mouse")!;
    expect(pageCall[0].addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(pageCall[1]).toMatchObject({ userAgent, maxBytes: 2 * 1024 * 1024 });
    expect(result.snippet.length).toBeLessThanOrEqual(1_000);
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects unsafe redirects, HTTPS downgrade, oversized responses, and blocked MIME", async () => {
    const unsafeRedirect = fixtureTransport({
      status: 302,
      headers: { location: "https://127.0.0.1/x" },
    });
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver: safeResolver,
        transport: unsafeRedirect,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });

    const downgrade = fixtureTransport({
      status: 302,
      headers: { location: "http://example.com/x" },
    });
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver: safeResolver,
        transport: downgrade,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });

    const oversized = fixtureTransport({
      body: Buffer.alloc(AI_RESEARCH_LIMITS.maxResponseBytes + 1, 97),
    });
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver: safeResolver,
        transport: oversized,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });

    const pdf = fixtureTransport({ headers: { "content-type": "application/pdf" }, body: "%PDF" });
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver: safeResolver,
        transport: pdf,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });
  });

  it("re-resolves every request and rejects DNS rebinding to an unsafe address", async () => {
    const resolver = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const transport = fixtureTransport({ body: "evidence" });
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver,
        transport,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({ code: "AI_FETCH_POLICY_BLOCKED" });
    expect(transport.get).not.toHaveBeenCalled();
  });

  it("applies exact-agent robots rules before wildcard, longest match, allow ties, and delay", () => {
    const policy = `
      User-agent: *
      Disallow: /
      User-agent: GamerPeruResearchBot
      Disallow: /products
      Allow: /products/public
      Disallow: /products/public
      Disallow: /download/*.zip$
      Crawl-delay: 7
    `;
    expect(evaluateRobotsPolicy(policy, "/products/public/mouse", userAgent)).toEqual({
      allowed: true,
      crawlDelayMs: 7_000,
    });
    expect(evaluateRobotsPolicy(policy, "/products/private", userAgent).allowed).toBe(false);
    expect(evaluateRobotsPolicy(policy, "/download/archive.zip", userAgent).allowed).toBe(false);
    expect(evaluateRobotsPolicy(policy, "/download/archive.zip?mirror=1", userAgent).allowed).toBe(
      true
    );
  });

  it("fails closed on publisher denial and malformed robots policy", async () => {
    const denied: SafeHttpTransport = {
      async get(target) {
        if (target.url.pathname === "/robots.txt") {
          return { status: 403, headers: {}, body: Buffer.alloc(0) };
        }
        throw new Error("page must not be fetched");
      },
    };
    await expect(
      fetchDestination({
        url: "https://example.com/x",
        userAgent,
        resolver: safeResolver,
        transport: denied,
        rateLimiter: noWait(),
      })
    ).rejects.toMatchObject({
      code: "AI_FETCH_POLICY_BLOCKED",
      fetchStatus: "FILTERED_UNTRUSTED",
    });
    expect(() => evaluateRobotsPolicy("not a robots directive", "/", userAgent)).toThrow();
  });

  it("bounds normalized text and applies true official-host boundaries after redirects", () => {
    expect(extractVisibleText(`  ${"word ".repeat(20_000)}`, "text/plain").text.length).toBe(
      AI_RESEARCH_LIMITS.maxNormalizedTextCharacters
    );
    expect(isOfficialHostname("support.logitech.com", "logitech.com")).toBe(true);
    expect(isOfficialHostname("logitech.com.attacker.example", "logitech.com")).toBe(false);
    expect(isOfficialHostname("xn--logtech-9za.example", "logitech.com")).toBe(false);
  });

  it("routes DIRECT_URL through the shared destination fetcher", async () => {
    const fetcher = vi.fn(async () => ({
      originalUrl: "https://example.com/item",
      resolvedUrl: "https://example.com/item",
      title: "Item",
      text: "evidence",
      snippet: "evidence",
      contentSha256: "c".repeat(64),
      fetchedAt: new Date(),
    }));
    const evidence = await acquireDirectUrlEvidence({
      url: "https://example.com/item",
      userAgent,
      canonicalBrandHostname: "example.com",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(evidence.retrievalMethod).toBe("DIRECT_URL");
    expect(evidence.trustTier).toBe("TIER_1_OFFICIAL_MANUFACTURER");
  });
});
