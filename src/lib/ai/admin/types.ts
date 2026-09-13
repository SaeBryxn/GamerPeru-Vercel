import type { ProposalReviewDecision, ProposalApplyStepStatus } from "@/lib/ai/proposals/types";

export const ADMIN_AI_PROVIDER_KEYS = ["google", "openai", "anthropic"] as const;
export const ADMIN_AI_PROFILE_KEYS = [
  "PRODUCT_RESEARCH_FAST",
  "PRODUCT_RESEARCH_DEEP",
  "SEO_COPY",
  "BATCH_IMPORT",
] as const;

export const RESEARCH_ITEM_STATUSES = [
  "PENDING",
  "RESEARCHING",
  "READY_FOR_REVIEW",
  "NEEDS_ATTENTION",
  "AMBIGUOUS",
  "SOURCE_CONFLICT",
  "FAILED",
  "APPROVED",
  "APPLIED",
] as const;

export type AdminAiProviderKey = (typeof ADMIN_AI_PROVIDER_KEYS)[number];
export type AdminAiProfileKey = (typeof ADMIN_AI_PROFILE_KEYS)[number];
export type ResearchItemStatus = (typeof RESEARCH_ITEM_STATUSES)[number];

export interface AdminAiActionResult<T = undefined> {
  success: boolean;
  data?: T;
  code?: string;
  error?: string;
}

export interface ResearchProfileOptionDto {
  id: string;
  profileKey: string;
  providerDisplayName: string;
  modelId: string;
  isEnabled: boolean;
  providerEnabled: boolean;
  researchExecutionSupported: boolean;
}

export interface ResearchProductOptionDto {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT";
}

export interface ResearchJobSummaryDto {
  jobId: string;
  jobType: "SINGLE" | "BATCH";
  jobStatus: "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIALLY_FAILED" | "FAILED";
  dispatchStatus: "PENDING_DISPATCH" | "DISPATCHED" | "DISPATCH_FAILED";
  totalItems: number;
  completedItems: number;
  failedItems: number;
  reviewableItems: number;
  activeItems: number;
  profileKey: string;
  providerDisplayName: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchJobItemDto {
  itemId: string;
  itemIndex: number;
  inputQuery: string;
  mode: "CREATE" | "ENRICH";
  targetProductId: string | null;
  targetProductName: string | null;
  identityStatus: string;
  status: ResearchItemStatus;
  errorCode: string | null;
  errorMessage: string | null;
  proposalId: string | null;
  proposalStatus: "DRAFT" | "APPROVED" | "REJECTED" | "APPLYING" | "APPLIED" | null;
  updatedAt: string;
}

export interface ResearchJobDetailDto extends ResearchJobSummaryDto {
  items: ResearchJobItemDto[];
}

export interface CatalogReferenceDto {
  id: string;
  name: string;
  slug: string;
}

export interface AdminProposalSourceDto {
  id: string;
  sourceName: string;
  url: string | null;
  retrievalMethod: string;
  trustTier: string;
  trustBasis: string;
  fetchedAt: string;
  fetchStatus: string;
  snippet: string | null;
}

export interface AdminProposalFieldSourceDto {
  id: string;
  sourceId: string;
  relationship: "SUPPORTS" | "CONFLICTS" | "CONTEXT_ONLY";
  sourceValue: unknown;
}

export interface AdminProposalFieldDto {
  id: string;
  fieldPath: string;
  proposedValue: unknown;
  selectedValue: unknown;
  decision: ProposalReviewDecision;
  verificationState:
    "VERIFIED_OFFICIAL" | "VERIFIED_SECONDARY" | "AI_INFERRED" | "SOURCE_CONFLICT" | "UNVERIFIED";
  preferredSourceId: string | null;
  conflictDetails: unknown;
  reviewedAt: string | null;
  updatedAt: string;
  sources: AdminProposalFieldSourceDto[];
}

export interface AdminProposalReviewDto {
  proposal: {
    id: string;
    status: "DRAFT" | "APPROVED" | "REJECTED" | "APPLYING" | "APPLIED";
    proposedName: string;
    proposedSlug: string;
    proposedSubtitle: string | null;
    proposedDescription: string | null;
    proposedSpecifications: unknown;
    unmappedSpecifications: unknown;
    proposedVariants: unknown;
    proposedSeoDraft: unknown;
    mediaCandidates: unknown;
    appliedProductId: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  item: {
    id: string;
    query: string;
    mode: "CREATE" | "ENRICH";
    status: string;
    identityStatus: string;
    targetProductId: string | null;
  };
  catalogSelections: {
    brand: { id: string; name: string; status: string } | null;
    category: { id: string; name: string; status: string } | null;
  };
  fields: AdminProposalFieldDto[];
  sources: AdminProposalSourceDto[];
}

export interface AdminApplyStepDto {
  stepKey: string;
  stepOrdinal: number;
  stepStatus: ProposalApplyStepStatus;
  targetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProposalApplyStatusDto {
  proposalId: string;
  proposalStatus: "APPROVED" | "APPLYING" | "APPLIED";
  itemStatus: "APPROVED" | "APPLIED";
  mode: "CREATE" | "ENRICH";
  canonicalProductId: string | null;
  steps: AdminApplyStepDto[];
}

export interface AdminAiProviderDto {
  id: string;
  providerKey: AdminAiProviderKey;
  displayName: string;
  isEnabled: boolean;
  isDefault: boolean;
  settings: Record<string, unknown>;
  researchExecutionSupported: boolean;
  healthCheckSupported: boolean;
  updatedAt: string;
  credential: AdminAiCredentialDto | null;
}

export interface AdminAiProviderCapabilityDto {
  providerKey: AdminAiProviderKey;
  researchExecutionSupported: boolean;
  healthCheckSupported: boolean;
}

export interface AdminAiCredentialDto {
  id: string;
  providerId: string;
  maskedKey: string;
  status: "ACTIVE" | "REVOKED";
  keyVersion: number;
  lastHealthStatus: "HEALTHY" | "UNHEALTHY" | "UNTESTED" | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAiProfileDto {
  id: string;
  profileKey: AdminAiProfileKey;
  providerId: string;
  providerDisplayName: string;
  modelId: string;
  temperature: string;
  maxTokens: number;
  isEnabled: boolean;
  researchExecutionSupported: boolean;
  updatedAt: string;
}

export interface AdminAiSettingsDto {
  providers: AdminAiProviderDto[];
  profiles: AdminAiProfileDto[];
  providerCapabilities: AdminAiProviderCapabilityDto[];
}
