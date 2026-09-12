import "server-only";

import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import { AI_RESEARCH_LIMITS } from "./config";
import { researchDomainRateLimiter } from "./domain-rate-limiter";
import type { DomainRateLimiter } from "./domain-rate-limiter";
import { fetchRobotsDecision } from "./robots-policy";
import { nodeSafeHttpTransport } from "./safe-http-transport";
import type { SafeHttpResponse, SafeHttpTransport } from "./safe-http-transport";
import { ResearchExecutionError } from "./types";
import { validateExternalUrl } from "./url-security";
import type { DnsResolver } from "./url-security";

const ALLOWED_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain"]);
const BLOCKED_ELEMENTS = new Set([
  "script",
  "style",
  "iframe",
  "form",
  "object",
  "embed",
  "svg",
  "canvas",
  "noscript",
  "template",
]);

function isHiddenElement(node: Parameters<typeof DomUtils.removeElement>[0]): boolean {
  if (node.type !== "tag") return false;
  const style = node.attribs.style?.replace(/\s+/g, "").toLowerCase() ?? "";
  return (
    "hidden" in node.attribs ||
    node.attribs["aria-hidden"]?.toLowerCase() === "true" ||
    /(?:^|;)display:none(?:;|$)/.test(style) ||
    /(?:^|;)visibility:hidden(?:;|$)/.test(style)
  );
}

export interface DestinationFetchResult {
  originalUrl: string;
  resolvedUrl: string;
  title: string;
  text: string;
  snippet: string;
  contentSha256: string;
  fetchedAt: Date;
}

function normalizeText(value: string, maximum: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function extractVisibleText(
  body: string,
  contentType: string
): { title: string; text: string } {
  if (contentType === "text/plain") {
    const text = normalizeText(body, AI_RESEARCH_LIMITS.maxNormalizedTextCharacters);
    return { title: "External product evidence", text };
  }
  const document = parseDocument(body, { decodeEntities: true });
  const blocked = DomUtils.findAll(
    (node) =>
      node.type === "script" ||
      node.type === "style" ||
      (node.type === "tag" &&
        (BLOCKED_ELEMENTS.has(node.name.toLowerCase()) || isHiddenElement(node))),
    document.children
  );
  for (const node of blocked) DomUtils.removeElement(node);
  const titleNode = DomUtils.findOne(
    (node) => node.type === "tag" && node.name.toLowerCase() === "title",
    document.children
  );
  const title = normalizeText(titleNode ? DomUtils.textContent(titleNode) : "", 500);
  const text = normalizeText(
    DomUtils.textContent(document),
    AI_RESEARCH_LIMITS.maxNormalizedTextCharacters
  );
  return { title: title || "External product evidence", text };
}

async function fetchWithRedirects(options: {
  url: URL;
  userAgent: string;
  resolver?: DnsResolver;
  transport: SafeHttpTransport;
  signal?: AbortSignal;
  redirects?: number;
  rateLimiter: DomainRateLimiter;
}): Promise<{ response: SafeHttpResponse; url: URL }> {
  const target = await validateExternalUrl(options.url, options.resolver);
  await options.rateLimiter.wait(target.hostname);
  const robots = await fetchRobotsDecision({
    destination: target.url,
    userAgent: options.userAgent,
    resolver: options.resolver,
    transport: options.transport,
    signal: options.signal,
  });
  if (!robots.allowed) {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Publisher policy denied access.");
  }
  await options.rateLimiter.wait(target.hostname, robots.crawlDelayMs);
  const response = await options.transport.get(target, {
    userAgent: options.userAgent,
    maxBytes: AI_RESEARCH_LIMITS.maxResponseBytes,
    signal: options.signal,
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    const redirects = options.redirects ?? 0;
    if (redirects >= AI_RESEARCH_LIMITS.maxRedirects) {
      throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Redirect limit exceeded.");
    }
    const next = new URL(response.headers.location, options.url);
    if (options.url.protocol === "https:" && next.protocol !== "https:") {
      throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "HTTPS downgrade is blocked.");
    }
    return await fetchWithRedirects({ ...options, url: next, redirects: redirects + 1 });
  }
  return { response, url: options.url };
}

export async function fetchDestination(options: {
  url: string;
  userAgent: string;
  resolver?: DnsResolver;
  transport?: SafeHttpTransport;
  rateLimiter?: DomainRateLimiter;
  signal?: AbortSignal;
}): Promise<DestinationFetchResult> {
  const original = new URL(options.url);
  const transport = options.transport ?? nodeSafeHttpTransport;
  const rateLimiter = options.rateLimiter ?? researchDomainRateLimiter;
  const { response, url: resolved } = await fetchWithRedirects({
    url: original,
    userAgent: options.userAgent,
    resolver: options.resolver,
    transport,
    signal: options.signal,
    rateLimiter,
  });
  if (response.status !== 200) {
    throw new ResearchExecutionError("AI_FETCH_FAILED", "Destination returned an unusable status.");
  }
  if (response.body.length > AI_RESEARCH_LIMITS.maxResponseBytes) {
    throw new ResearchExecutionError(
      "AI_FETCH_POLICY_BLOCKED",
      "Destination response is too large."
    );
  }
  const contentType = (response.headers["content-type"] ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ResearchExecutionError(
      "AI_FETCH_POLICY_BLOCKED",
      "Destination MIME type is blocked."
    );
  }
  const rawText = response.body.toString("utf8");
  const extracted = extractVisibleText(rawText, contentType);
  if (!extracted.text) {
    throw new ResearchExecutionError("AI_FETCH_FAILED", "Destination contained no usable text.");
  }
  return {
    originalUrl: original.href,
    resolvedUrl: resolved.href,
    title: extracted.title,
    text: extracted.text,
    snippet: extracted.text.slice(0, AI_RESEARCH_LIMITS.maxPersistedSnippetCharacters),
    contentSha256: createHash("sha256").update(extracted.text, "utf8").digest("hex"),
    fetchedAt: new Date(),
  };
}
