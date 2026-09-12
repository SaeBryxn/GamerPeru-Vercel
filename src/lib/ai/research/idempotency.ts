import { createHash } from "node:crypto";
import type { NormalizedResearchItem, ResearchProfileSnapshot } from "./types";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function createResearchMutationDigest(
  actorAuthUserId: string,
  rawMutationRequestId: string
): string {
  return createHash("sha256")
    .update(`${actorAuthUserId}:ai:research-job:create:${rawMutationRequestId}`, "utf8")
    .digest("hex");
}

export function createResearchRequestFingerprint(input: {
  jobType: "SINGLE" | "BATCH";
  items: NormalizedResearchItem[];
  selectedProfileId: string;
  profileSnapshot: ResearchProfileSnapshot;
}): string {
  return createHash("sha256").update(stableSerialize(input), "utf8").digest("hex");
}

export function createProviderRequestDigest(input: unknown): string {
  return createHash("sha256").update(stableSerialize(input), "utf8").digest("hex");
}
