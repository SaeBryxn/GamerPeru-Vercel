"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { createResearchJobAction } from "@/lib/ai/research/actions";
import {
  applyProposalAction,
  approveProposalAction,
  getProposalApplyStatusAction,
  getProposalReviewDetailAction,
  initializeCatalogSelectionReviewsAction,
  rejectProposalAction,
  reviewProposalFieldAction,
  setHumanVariantPlanAction,
} from "@/lib/ai/proposals/actions";
import { configureProvider } from "@/lib/ai/provider-service";
import { configureProfile } from "@/lib/ai/profile-service";
import {
  executeCredentialHealthCheck,
  revokeCredential,
  rotateCredentialKey,
  saveCredential,
  type SafeCredentialDto,
} from "@/lib/ai/credential-service";
import { mapAdminAiError } from "./error-mapping";
import {
  assertAdminProfileRuntimeCompatibility,
  assertAdminProviderHealthCheckSupported,
  assertAdminResearchSubmissionEligibility,
  getResearchJobDetail,
} from "./readers";
import {
  adminCredentialMutationSchema,
  adminCredentialSaveSchema,
  adminProfileConfigurationSchema,
  adminProposalFieldDecisionSchema,
  adminProposalReadSchema,
  adminProposalVersionSchema,
  adminProviderConfigurationSchema,
  adminProviderOperationSchema,
  adminResearchJobReadSchema,
  adminResearchSubmissionSchema,
  adminVariantPlanSchema,
} from "./schemas";
import type {
  AdminAiActionResult,
  AdminAiCredentialDto,
  AdminProposalApplyStatusDto,
  AdminProposalReviewDto,
  ResearchJobDetailDto,
} from "./types";

function unauthenticated<T>(): AdminAiActionResult<T> {
  return {
    success: false,
    code: "AUTHENTICATION_REQUIRED",
    error: "Inicia sesión con una cuenta de personal autorizada.",
  };
}

function toCredentialDto(credential: SafeCredentialDto): AdminAiCredentialDto {
  return {
    ...credential,
    lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}

function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function projectProposal(
  detail: Awaited<ReturnType<typeof getProposalReviewDetailAction>>
): AdminProposalReviewDto {
  return {
    proposal: {
      id: detail.proposal.id,
      status: detail.proposal.status,
      proposedName: detail.proposal.proposedName,
      proposedSlug: detail.proposal.proposedSlug,
      proposedSubtitle: detail.proposal.proposedSubtitle,
      proposedDescription: detail.proposal.proposedDescription,
      proposedSpecifications: detail.proposal.proposedSpecifications,
      unmappedSpecifications: detail.proposal.unmappedSpecifications,
      proposedVariants: detail.proposal.proposedVariants,
      proposedSeoDraft: detail.proposal.proposedSeoDraft,
      mediaCandidates: detail.proposal.mediaCandidates,
      appliedProductId: detail.proposal.appliedProductId,
      reviewedAt: detail.proposal.reviewedAt,
      createdAt: detail.proposal.createdAt,
      updatedAt: detail.proposal.updatedAt,
    },
    item: {
      id: detail.item.id,
      query: detail.item.query,
      mode: detail.item.mode,
      status: detail.item.status,
      identityStatus: detail.item.identityStatus,
      targetProductId: detail.item.targetProductId,
    },
    catalogSelections: detail.catalogSelections,
    fields: detail.fields.map((field) => ({
      id: field.id,
      fieldPath: field.fieldPath,
      proposedValue: field.proposedValue,
      selectedValue: field.selectedValue,
      decision: field.decision,
      verificationState: field.verificationState,
      preferredSourceId: field.preferredSourceId,
      conflictDetails: field.conflictDetails,
      reviewedAt: field.reviewedAt,
      updatedAt: field.updatedAt,
      sources: field.sources,
    })),
    sources: detail.sources.map((source) => ({
      id: source.id,
      sourceName: source.sourceName,
      url: safeSourceUrl(source.resolvedUrl ?? source.originalUrl),
      retrievalMethod: source.retrievalMethod,
      trustTier: source.trustTier,
      trustBasis: source.trustBasis,
      fetchedAt: source.fetchedAt,
      fetchStatus: source.fetchStatus,
      snippet: source.snippet?.slice(0, 500) ?? null,
    })),
  };
}

async function runAction<T>(operation: () => Promise<T>): Promise<AdminAiActionResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    return { success: false, ...mapAdminAiError(error) };
  }
}

export async function submitResearchJobAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ jobId: string; replayed: boolean }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminResearchSubmissionSchema.parse(rawInput);
    await assertAdminResearchSubmissionEligibility(input, { authContext });
    const result = await createResearchJobAction(input);
    revalidatePath("/admin/products/ai-import");
    return { jobId: result.jobId, replayed: result.replayed };
  });
}

export async function getResearchJobAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<ResearchJobDetailDto | null>> {
  return await runAction(async () => {
    const input = adminResearchJobReadSchema.parse(rawInput);
    return await getResearchJobDetail(input.jobId);
  });
}

export async function getProposalReviewAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<AdminProposalReviewDto>> {
  return await runAction(async () => {
    const input = adminProposalReadSchema.parse(rawInput);
    return projectProposal(await getProposalReviewDetailAction(input));
  });
}

export async function initializeProposalReviewAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ proposalUpdatedAt: string; replayed: boolean }>> {
  return await runAction(async () => {
    const input = adminProposalVersionSchema.parse(rawInput);
    const result = await initializeCatalogSelectionReviewsAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    return { proposalUpdatedAt: result.proposalUpdatedAt, replayed: result.replayed };
  });
}

export async function reviewProposalFieldAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ proposalUpdatedAt: string; replayed: boolean }>> {
  return await runAction(async () => {
    const input = adminProposalFieldDecisionSchema.parse(rawInput);
    const result = await reviewProposalFieldAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    return { proposalUpdatedAt: result.proposalUpdatedAt, replayed: result.replayed };
  });
}

export async function setHumanVariantPlanAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ proposalUpdatedAt: string; replayed: boolean }>> {
  return await runAction(async () => {
    const input = adminVariantPlanSchema.parse(rawInput);
    const result = await setHumanVariantPlanAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    return { proposalUpdatedAt: result.proposalUpdatedAt, replayed: result.replayed };
  });
}

export async function approveProposalAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ status: "APPROVED"; proposalUpdatedAt: string }>> {
  return await runAction(async () => {
    const input = adminProposalVersionSchema.parse(rawInput);
    const result = await approveProposalAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    return { status: "APPROVED", proposalUpdatedAt: result.proposalUpdatedAt };
  });
}

export async function rejectProposalAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ status: "REJECTED"; proposalUpdatedAt: string }>> {
  return await runAction(async () => {
    const input = adminProposalVersionSchema.parse(rawInput);
    const result = await rejectProposalAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    return { status: "REJECTED", proposalUpdatedAt: result.proposalUpdatedAt };
  });
}

export async function applyProposalAdminAction(
  rawInput: unknown
): Promise<
  AdminAiActionResult<{ status: "APPLYING" | "APPLIED"; canonicalProductId: string | null }>
> {
  return await runAction(async () => {
    const input = adminProposalReadSchema.parse(rawInput);
    const result = await applyProposalAction(input);
    revalidatePath(`/admin/products/ai-import/proposals/${input.proposalId}`);
    revalidatePath("/admin/products");
    return { status: result.status, canonicalProductId: result.canonicalProductId };
  });
}

export async function getProposalApplyStatusAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<AdminProposalApplyStatusDto>> {
  return await runAction(async () => {
    const input = adminProposalReadSchema.parse(rawInput);
    const result = await getProposalApplyStatusAction(input);
    return {
      proposalId: result.proposalId,
      proposalStatus: result.proposalStatus,
      itemStatus: result.itemStatus,
      mode: result.mode,
      canonicalProductId: result.canonicalProductId,
      steps: result.steps,
    };
  });
}

export async function configureProviderAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ providerId: string }>> {
  return await runAction(async () => {
    const input = adminProviderConfigurationSchema.parse(rawInput);
    let settings: unknown;
    try {
      settings = input.settingsJson ? JSON.parse(input.settingsJson) : {};
    } catch {
      throw new ZodError([]);
    }
    const authContext = await getVerifiedAuthContext();
    if (authContext.status !== "READY")
      return Promise.reject(new Error("AUTHENTICATION_REQUIRED:"));
    const provider = await configureProvider(
      {
        providerKey: input.providerKey,
        displayName: input.displayName,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
        settings: settings as Record<string, unknown>,
      },
      { authContext }
    );
    revalidatePath("/admin/settings/ai");
    return { providerId: provider.id };
  });
}

export async function saveCredentialAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<AdminAiCredentialDto>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminCredentialSaveSchema.parse(rawInput);
    const credential = await saveCredential(input, { authContext });
    revalidatePath("/admin/settings/ai");
    return toCredentialDto(credential);
  });
}

export async function revokeCredentialAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<AdminAiCredentialDto>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminCredentialMutationSchema.parse(rawInput);
    const credential = await revokeCredential(input, { authContext });
    revalidatePath("/admin/settings/ai");
    return toCredentialDto(credential);
  });
}

export async function rotateCredentialKeyAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<AdminAiCredentialDto>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminCredentialMutationSchema.parse(rawInput);
    const credential = await rotateCredentialKey(input, { authContext });
    revalidatePath("/admin/settings/ai");
    return toCredentialDto(credential);
  });
}

export async function testCredentialAdminAction(rawInput: unknown): Promise<
  AdminAiActionResult<{
    ok: boolean;
    status: "HEALTHY" | "UNHEALTHY";
    code: string;
    message: string;
  }>
> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminProviderOperationSchema.parse(rawInput);
    await assertAdminProviderHealthCheckSupported(input.providerId, { authContext });
    const result = await executeCredentialHealthCheck(input.providerId, { authContext });
    revalidatePath("/admin/settings/ai");
    return {
      ...result,
      message: result.ok
        ? "La conexión con el proveedor respondió correctamente."
        : "El proveedor no superó la prueba de conexión.",
    };
  });
}

export async function configureProfileAdminAction(
  rawInput: unknown
): Promise<AdminAiActionResult<{ profileId: string }>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") return unauthenticated();
  return await runAction(async () => {
    const input = adminProfileConfigurationSchema.parse(rawInput);
    await assertAdminProfileRuntimeCompatibility(input, { authContext });
    const profile = await configureProfile(input, { authContext });
    revalidatePath("/admin/settings/ai");
    return { profileId: profile.id };
  });
}
