"use server";

import {
  humanVariantPlanInputSchema,
  proposalFieldDecisionInputSchema,
  proposalReadInputSchema,
  proposalVersionInputSchema,
} from "./schemas";
import { proposalApplyInputSchema } from "./apply-schemas";
import { applyProposal, getProposalApplyStatus } from "./apply-service";
import {
  approveProposal,
  getProposalReviewDetail,
  initializeCatalogSelectionReviews,
  rejectProposal,
  reviewProposalField,
  setHumanVariantPlan,
} from "./review-service";

export async function getProposalReviewDetailAction(input: unknown) {
  const parsed = proposalReadInputSchema.parse(input);
  return await getProposalReviewDetail(parsed.proposalId);
}

export async function initializeCatalogSelectionReviewsAction(input: unknown) {
  return await initializeCatalogSelectionReviews(proposalVersionInputSchema.parse(input));
}

export async function reviewProposalFieldAction(input: unknown) {
  return await reviewProposalField(proposalFieldDecisionInputSchema.parse(input));
}

export async function setHumanVariantPlanAction(input: unknown) {
  return await setHumanVariantPlan(humanVariantPlanInputSchema.parse(input));
}

export async function approveProposalAction(input: unknown) {
  return await approveProposal(proposalVersionInputSchema.parse(input));
}

export async function rejectProposalAction(input: unknown) {
  return await rejectProposal(proposalVersionInputSchema.parse(input));
}

export async function applyProposalAction(input: unknown) {
  return await applyProposal(proposalApplyInputSchema.parse(input));
}

export async function getProposalApplyStatusAction(input: unknown) {
  const parsed = proposalApplyInputSchema.parse(input);
  return await getProposalApplyStatus(parsed.proposalId);
}
