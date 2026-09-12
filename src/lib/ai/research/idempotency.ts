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

export interface ResearchRequestFingerprintInput {
  jobType: "SINGLE" | "BATCH";
  items: NormalizedResearchItem[];
  profileSnapshot: ResearchProfileSnapshot;
}

export function createCanonicalResearchRequestSemantics(input: ResearchRequestFingerprintInput) {
  const firstItem = input.jobType === "SINGLE" ? input.items[0] : undefined;
  return {
    jobType: input.jobType,
    orderedNormalizedItems: input.items,
    mode: firstItem?.mode ?? "CREATE",
    targetProductId: firstItem?.targetProductId ?? null,
    profileSnapshot: input.profileSnapshot,
  };
}

export function createResearchRequestFingerprint(input: ResearchRequestFingerprintInput): string {
  return createHash("sha256")
    .update(stableSerialize(createCanonicalResearchRequestSemantics(input)), "utf8")
    .digest("hex");
}

export function createProviderRequestDigest(input: unknown): string {
  return createHash("sha256").update(stableSerialize(input), "utf8").digest("hex");
}
