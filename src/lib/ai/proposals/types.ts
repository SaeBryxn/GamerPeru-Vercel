import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

export const PROPOSAL_REVIEW_DECISIONS = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "MANUALLY_EDITED",
] as const;

export type ProposalReviewDecision = (typeof PROPOSAL_REVIEW_DECISIONS)[number];

export const PROPOSAL_REVIEW_ERROR_CODES = [
  "AI_PROPOSAL_NOT_FOUND",
  "AI_PROPOSAL_NOT_DRAFT",
  "AI_PROPOSAL_STALE",
  "AI_PROPOSAL_INTEGRITY_ERROR",
  "AI_PROPOSAL_REVIEW_REQUIRED",
  "AI_PROPOSAL_INVALID_DECISION",
  "AI_PROPOSAL_INVALID_PREFERRED_SOURCE",
  "AI_PROPOSAL_CROSS_ITEM_SOURCE",
  "AI_PROPOSAL_UNRESOLVED_CONFLICT",
  "AI_PROPOSAL_INVALID_BRAND",
  "AI_PROPOSAL_INVALID_CATEGORY",
  "AI_PROPOSAL_INVALID_SLUG",
  "AI_PROPOSAL_INVALID_NAME",
  "AI_PROPOSAL_INVALID_VARIANT_PLAN",
  "AI_PROPOSAL_HUMAN_PRICE_REQUIRED",
  "AI_PROPOSAL_INVALID_ITEM_LIFECYCLE",
] as const;

export type ProposalReviewErrorCode = (typeof PROPOSAL_REVIEW_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<ProposalReviewErrorCode, string> = {
  AI_PROPOSAL_NOT_FOUND: "La propuesta solicitada no existe.",
  AI_PROPOSAL_NOT_DRAFT: "La propuesta ya no admite cambios de revisión.",
  AI_PROPOSAL_STALE: "La propuesta cambió desde la última lectura.",
  AI_PROPOSAL_INTEGRITY_ERROR: "El ledger de revisión de la propuesta no es íntegro.",
  AI_PROPOSAL_REVIEW_REQUIRED: "La propuesta todavía contiene campos sin revisar.",
  AI_PROPOSAL_INVALID_DECISION: "La decisión solicitada no es válida para este campo.",
  AI_PROPOSAL_INVALID_PREFERRED_SOURCE: "La fuente preferida no es válida para este campo.",
  AI_PROPOSAL_CROSS_ITEM_SOURCE: "La fuente seleccionada pertenece a otro item de investigación.",
  AI_PROPOSAL_UNRESOLVED_CONFLICT: "La propuesta todavía contiene conflictos sin resolver.",
  AI_PROPOSAL_INVALID_BRAND: "La marca seleccionada no existe o no está publicada.",
  AI_PROPOSAL_INVALID_CATEGORY: "La categoría seleccionada no existe o no está publicada.",
  AI_PROPOSAL_INVALID_SLUG: "El slug seleccionado no es válido.",
  AI_PROPOSAL_INVALID_NAME: "El nombre seleccionado no es válido.",
  AI_PROPOSAL_INVALID_VARIANT_PLAN: "El plan de variantes seleccionado no es válido.",
  AI_PROPOSAL_HUMAN_PRICE_REQUIRED: "Las variantes requieren precios ingresados por una persona.",
  AI_PROPOSAL_INVALID_ITEM_LIFECYCLE:
    "El item de investigación no está en un estado válido para esta operación.",
};

export class ProposalReviewError extends Error {
  constructor(
    readonly code: ProposalReviewErrorCode,
    message = DEFAULT_MESSAGES[code],
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = "ProposalReviewError";
  }
}

export interface ProposalReviewServiceOptions {
  authContext?: VerifiedAuthContextReady;
}

export interface NormalizedVariantPlanEntry {
  sku: string;
  title: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  weightGrams: number | null;
  attributes: Record<string, string>;
  displayOrder: number;
}

export interface ProposalReviewSourceDto {
  id: string;
  originalUrl: string | null;
  resolvedUrl: string | null;
  providerCitationId: string | null;
  sourceName: string;
  retrievalMethod: string;
  trustTier: string;
  trustBasis: string;
  fetchedAt: string;
  fetchStatus: string;
  snippet: string | null;
}

export interface ProposalFieldSourceDto {
  id: string;
  sourceId: string;
  relationship: "SUPPORTS" | "CONFLICTS" | "CONTEXT_ONLY";
  sourceValue: unknown;
}

export interface ProposalFieldReviewDto {
  id: string;
  fieldPath: string;
  proposedValue: unknown;
  selectedValue: unknown;
  decision: ProposalReviewDecision;
  verificationState:
    "VERIFIED_OFFICIAL" | "VERIFIED_SECONDARY" | "AI_INFERRED" | "SOURCE_CONFLICT" | "UNVERIFIED";
  preferredSourceId: string | null;
  conflictDetails: unknown;
  reviewedByAuthUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sources: ProposalFieldSourceDto[];
}

export interface ProposalReviewDetailDto {
  proposal: {
    id: string;
    status: "DRAFT" | "APPROVED" | "REJECTED" | "APPLYING" | "APPLIED";
    brandId: string | null;
    categoryId: string | null;
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
    reviewedByAuthUserId: string | null;
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
    targetProductVersionSnapshot: string | null;
  };
  catalogSelections: {
    brand: { id: string; name: string; status: string } | null;
    category: { id: string; name: string; status: string } | null;
  };
  fields: ProposalFieldReviewDto[];
  sources: ProposalReviewSourceDto[];
}

export interface ProposalMutationResult {
  proposalId: string;
  status: "DRAFT" | "APPROVED" | "REJECTED";
  proposalUpdatedAt: string;
  replayed: boolean;
}
