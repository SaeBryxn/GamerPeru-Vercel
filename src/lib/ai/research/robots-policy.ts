import "server-only";

import { AI_RESEARCH_LIMITS } from "./config";
import { ResearchExecutionError } from "./types";
import { validateExternalUrl } from "./url-security";
import type { DnsResolver } from "./url-security";
import { nodeSafeHttpTransport } from "./safe-http-transport";
import type { SafeHttpTransport, SafeHttpResponse } from "./safe-http-transport";

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

export interface RobotsDecision {
  allowed: boolean;
  crawlDelayMs: number;
}

function parseRobots(text: string): RobotsGroup[] {
  if (text.includes("\0")) {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Robots policy is invalid.");
  }
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Robots policy is invalid.");
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!value) {
        throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Robots policy is invalid.");
      }
      if (!current || current.rules.length > 0 || current.crawlDelaySeconds !== null) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (!current && ["allow", "disallow", "crawl-delay"].includes(field)) {
      throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Robots policy is invalid.");
    } else if (current && field === "allow") {
      current.rules.push({ allow: true, path: value });
    } else if (current && field === "disallow") {
      if (value) current.rules.push({ allow: false, path: value });
    } else if (current && field === "crawl-delay") {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3_600) {
        throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Robots policy is invalid.");
      }
      current.crawlDelaySeconds = seconds;
    }
  }
  return groups;
}

function selectGroups(groups: RobotsGroup[], userAgent: string): RobotsGroup[] {
  const normalized = userAgent.toLowerCase();
  const exact = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && normalized.includes(agent))
  );
  return exact.length > 0
    ? exact
    : groups.filter((group) => group.agents.some((agent) => agent === "*"));
}

function matchedRuleLength(rulePath: string, requestPath: string): number | null {
  const endAnchored = rulePath.endsWith("$");
  const expression = (endAnchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  if (!new RegExp(`^${expression}${endAnchored ? "$" : ""}`).test(requestPath)) return null;
  return rulePath.replace(/\*|\$$/g, "").length;
}

export function evaluateRobotsPolicy(
  text: string,
  path: string,
  userAgent: string
): RobotsDecision {
  const selected = selectGroups(parseRobots(text), userAgent);
  const rules = selected
    .flatMap((group) => group.rules)
    .map((rule) => ({ rule, length: matchedRuleLength(rule.path, path) }))
    .filter((match): match is { rule: RobotsRule; length: number } => match.length !== null);
  rules.sort(
    (left, right) =>
      right.length - left.length || Number(right.rule.allow) - Number(left.rule.allow)
  );
  const crawlDelayMs = Math.max(
    AI_RESEARCH_LIMITS.minimumHostIntervalMs,
    ...selected.map((group) => Math.round((group.crawlDelaySeconds ?? 0) * 1_000))
  );
  return { allowed: rules[0]?.rule.allow ?? true, crawlDelayMs };
}

async function fetchRobotsResponse(
  url: URL,
  userAgent: string,
  resolver: DnsResolver | undefined,
  transport: SafeHttpTransport,
  signal: AbortSignal | undefined,
  redirectCount = 0
): Promise<{ response: SafeHttpResponse; finalUrl: URL }> {
  const target = await validateExternalUrl(url, resolver);
  const response = await transport.get(target, {
    userAgent,
    maxBytes: AI_RESEARCH_LIMITS.robotsMaxBytes,
    signal,
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    if (redirectCount >= AI_RESEARCH_LIMITS.maxRedirects) {
      throw new ResearchExecutionError(
        "AI_FETCH_POLICY_BLOCKED",
        "Robots redirect limit exceeded."
      );
    }
    const redirected = new URL(response.headers.location, url);
    if (url.protocol === "https:" && redirected.protocol !== "https:") {
      throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "HTTPS downgrade is blocked.");
    }
    return await fetchRobotsResponse(
      redirected,
      userAgent,
      resolver,
      transport,
      signal,
      redirectCount + 1
    );
  }
  return { response, finalUrl: url };
}

export async function fetchRobotsDecision(options: {
  destination: URL;
  userAgent: string;
  resolver?: DnsResolver;
  transport?: SafeHttpTransport;
  signal?: AbortSignal;
}): Promise<RobotsDecision> {
  const robotsUrl = new URL("/robots.txt", options.destination.origin);
  const { response } = await fetchRobotsResponse(
    robotsUrl,
    options.userAgent,
    options.resolver,
    options.transport ?? nodeSafeHttpTransport,
    options.signal
  );
  if (response.status === 404 || response.status === 410) {
    return { allowed: true, crawlDelayMs: AI_RESEARCH_LIMITS.minimumHostIntervalMs };
  }
  if (response.status !== 200) {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Publisher policy denied access.");
  }
  const text = response.body.toString("utf8");
  return evaluateRobotsPolicy(
    text,
    `${options.destination.pathname}${options.destination.search}`,
    options.userAgent
  );
}
