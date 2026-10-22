import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiProfiles, aiProviderAttempts, aiProviders } from "@/db/schema";
import { RESEARCH_PROVIDER_KEYS } from "../gateway/registry";
import { AiGatewayError } from "../gateway/types";
import { createProfileSnapshot } from "../profile-service";
import type { ResearchProfileSnapshot } from "./types";

/** Profile used automatically when the job's own profile is out of free quota or down. */
export const RESEARCH_FALLBACK_PROFILE_KEY = "PRODUCT_RESEARCH_FALLBACK";

/**
 * Requests per day kept under each provider's free tier, with a margin
 * (Gemini Flash allows about 250 a day, Groq Llama 3.3 70B about 1,000).
 */
export const FREE_TIER_DAILY_REQUESTS: Readonly<Record<string, number>> = Object.freeze({
  google: 200,
  groq: 900,
});

export interface ResearchExecutionTarget {
  profileId: string;
  snapshot: ResearchProfileSnapshot;
  providerKey: string;
}

/** The enabled fallback profile on a different, enabled provider, or null when there is none. */
export async function loadFallbackExecution(
  primaryProviderId: string
): Promise<ResearchExecutionTarget | null> {
  const [row] = await db
    .select({ profile: aiProfiles, providerKey: aiProviders.providerKey })
    .from(aiProfiles)
    .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
    .where(
      and(
        eq(aiProfiles.profileKey, RESEARCH_FALLBACK_PROFILE_KEY),
        eq(aiProfiles.isEnabled, true),
        eq(aiProviders.isEnabled, true)
      )
    )
    .limit(1);
  if (
    !row ||
    row.profile.providerId === primaryProviderId ||
    !(RESEARCH_PROVIDER_KEYS as readonly string[]).includes(row.providerKey)
  ) {
    return null;
  }
  return {
    profileId: row.profile.id,
    snapshot: createProfileSnapshot(row.profile),
    providerKey: row.providerKey,
  };
}

/** True once today's (UTC) attempts on the provider reach its free-tier budget. */
export async function isOverDailyFreeTier(target: ResearchExecutionTarget): Promise<boolean> {
  const limit = FREE_TIER_DAILY_REQUESTS[target.providerKey];
  if (limit === undefined) return false;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ attempts: count() })
    .from(aiProviderAttempts)
    .where(
      and(
        eq(aiProviderAttempts.providerId, target.snapshot.providerId),
        gte(aiProviderAttempts.startedAt, startOfDay)
      )
    );
  return (row?.attempts ?? 0) >= limit;
}

/** Only failures that say "nothing happened, try elsewhere"; ambiguous outcomes are never retried. */
export function shouldFallBack(error: unknown): boolean {
  return (
    error instanceof AiGatewayError &&
    !error.outcomeAmbiguous &&
    (error.code === "AI_PROVIDER_RATE_LIMITED" || error.code === "AI_PROVIDER_UNAVAILABLE")
  );
}
