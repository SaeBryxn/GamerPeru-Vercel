export const RESEARCH_JOB_TYPES = ["SINGLE", "BATCH"] as const;
export const RESEARCH_MODES = ["CREATE", "ENRICH"] as const;
export const IDENTITY_STATUSES = [
  "PENDING",
  "EXACT_MATCH",
  "PROBABLE_MATCH",
  "AMBIGUOUS",
  "UNSUPPORTED_CATEGORY",
  "CONFLICTING_IDENTIFIERS",
  "MANUALLY_DISAMBIGUATED",
] as const;

export const RESEARCH_ERROR_CODES = [
  "AI_SEARCH_CONFIG_MISSING",
  "AI_SEARCH_IN_PROGRESS",
  "AI_SEARCH_AUTH_FAILED",
  "AI_SEARCH_RATE_LIMITED",
  "AI_SEARCH_UNAVAILABLE",
  "AI_SEARCH_RESPONSE_INVALID",
  "AI_SEARCH_NO_USABLE_EVIDENCE",
  "AI_SEARCH_OUTCOME_UNKNOWN",
  "AI_FETCH_POLICY_BLOCKED",
  "AI_FETCH_FAILED",
  "AI_EVIDENCE_CHANGED",
  "AI_EVIDENCE_REHYDRATION_FAILED",
  "AI_PROVIDER_DISABLED",
  "AI_PROFILE_DISABLED",
  "AI_PROVIDER_AUTH_FAILED",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_RESPONSE_INVALID",
  "AI_PROVIDER_OUTCOME_UNKNOWN",
  "LEASE_LOST",
] as const;

export type ResearchJobType = (typeof RESEARCH_JOB_TYPES)[number];
export type ResearchMode = (typeof RESEARCH_MODES)[number];
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];
export type RetrievalMethod = "SEARCH_API" | "DIRECT_URL";

export interface ResearchProfileSnapshot {
  profileKey: string;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
}

export interface NormalizedResearchItem {
  query: string;
  mode: ResearchMode;
  targetProductId: string | null;
  targetProductVersionSnapshot: string | null;
}

export interface ExternalProductEvidence {
  sourceId?: string;
  originalUrl: string;
  resolvedUrl: string;
  title: string;
  text: string;
  snippet: string;
  contentSha256: string;
  retrievalMethod: RetrievalMethod;
  trustTier:
    | "TIER_1_OFFICIAL_MANUFACTURER"
    | "TIER_2_OFFICIAL_MANUAL"
    | "TIER_3_OFFICIAL_MEDIA_KIT"
    | "TIER_4_AUTHORIZED_DISTRIBUTOR"
    | "TIER_5_REPUTABLE_SECONDARY"
    | "TIER_6_PUBLIC_SUPPORTING";
  trustBasis: "CANONICAL_BRAND_DOMAIN_MATCH" | "MANUAL_STAFF_VERIFIED" | "UNVERIFIED_DEFAULT";
  fetchedAt: Date;
}

export class ResearchExecutionError extends Error {
  readonly fetchStatus: "FILTERED_UNTRUSTED" | undefined;

  constructor(
    readonly code: ResearchErrorCode,
    message: string,
    readonly outcomeAmbiguous = false
  ) {
    super(message);
    this.name = "ResearchExecutionError";
    this.fetchStatus = code === "AI_FETCH_POLICY_BLOCKED" ? "FILTERED_UNTRUSTED" : undefined;
  }
}

export class LeaseLostError extends ResearchExecutionError {
  constructor() {
    super("LEASE_LOST", "The research item lease is no longer owned by this worker.");
    this.name = "LeaseLostError";
  }
}
