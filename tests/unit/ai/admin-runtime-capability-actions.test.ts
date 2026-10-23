import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AuthRbac from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateStorefrontCatalog: vi.fn(),
  getVerifiedAuthContext: vi.fn(),
  assertResearchEligibility: vi.fn(),
  assertProfileCompatibility: vi.fn(),
  assertHealthCheckSupported: vi.fn(),
  createResearchJobAction: vi.fn(),
  executeCredentialHealthCheck: vi.fn(),
  configureProfile: vi.fn(),
  applyProposal: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/catalog/catalog-cache", () => ({
  revalidateStorefrontCatalog: mocks.revalidateStorefrontCatalog,
}));

vi.mock("@/lib/auth/rbac", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthRbac>();
  return { ...actual, getVerifiedAuthContext: mocks.getVerifiedAuthContext };
});

vi.mock("@/lib/ai/research/actions", () => ({
  createResearchJobAction: mocks.createResearchJobAction,
}));

vi.mock("@/lib/ai/proposals/actions", () => ({
  applyProposalAction: mocks.applyProposal,
  approveProposalAction: vi.fn(),
  getProposalApplyStatusAction: vi.fn(),
  getProposalReviewDetailAction: vi.fn(),
  initializeCatalogSelectionReviewsAction: vi.fn(),
  rejectProposalAction: vi.fn(),
  reviewProposalFieldAction: vi.fn(),
  setHumanVariantPlanAction: vi.fn(),
}));

vi.mock("@/lib/ai/provider-service", () => ({ configureProvider: vi.fn() }));
vi.mock("@/lib/ai/profile-service", () => ({ configureProfile: mocks.configureProfile }));
vi.mock("@/lib/ai/credential-service", () => ({
  executeCredentialHealthCheck: mocks.executeCredentialHealthCheck,
  revokeCredential: vi.fn(),
  rotateCredentialKey: vi.fn(),
  saveCredential: vi.fn(),
}));
vi.mock("@/lib/ai/admin/readers", () => ({
  assertAdminProfileRuntimeCompatibility: mocks.assertProfileCompatibility,
  assertAdminProviderHealthCheckSupported: mocks.assertHealthCheckSupported,
  assertAdminResearchSubmissionEligibility: mocks.assertResearchEligibility,
  getResearchJobDetail: vi.fn(),
}));

import {
  applyProposalAdminAction,
  configureProfileAdminAction,
  submitResearchJobAdminAction,
  testCredentialAdminAction,
} from "@/lib/ai/admin/actions";

const profileId = "018f0025-4100-7000-8000-000000000001";
const providerId = "018f0025-4100-7000-8000-000000000002";
const productId = "018f0025-4100-7000-8000-000000000003";

describe("GP-025 / CHK4-BR1 — Admin action runtime admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedAuthContext.mockResolvedValue({
      status: "READY",
      authUserId: "018f0025-4100-7000-8000-000000000004",
      email: "br1-action@gamerperu.invalid",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(["catalog:ai_research", "ai:manage_credentials"]),
    });
  });

  it.each(["APPLYING", "APPLIED"])(
    "invalida el catálogo con max solo al terminar (%s)",
    async (status) => {
      mocks.applyProposal.mockResolvedValueOnce({ status, canonicalProductId: productId });
      expect(await applyProposalAdminAction({ proposalId: profileId })).toMatchObject({
        success: true,
        data: { status },
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.revalidateStorefrontCatalog).toHaveBeenCalledTimes(status === "APPLIED" ? 1 : 0);
    }
  );

  it.each(["openai", "anthropic"])(
    "rejects a manipulated %s research submission before frozen job creation",
    async () => {
      mocks.assertResearchEligibility.mockRejectedValueOnce(
        new Error("AI_RESEARCH_PROVIDER_UNSUPPORTED: no frozen runtime adapter")
      );
      const result = await submitResearchJobAdminAction({
        mutationRequestId: crypto.randomUUID(),
        selectedProfileId: profileId,
        items: [{ query: "Producto sin adapter", mode: "CREATE" }],
      });
      expect(result).toMatchObject({ success: false, code: "AI_RESEARCH_PROVIDER_UNSUPPORTED" });
      expect(mocks.createResearchJobAction).not.toHaveBeenCalled();
    }
  );

  it("forwards an eligible Google profile through the frozen research action", async () => {
    mocks.assertResearchEligibility.mockResolvedValueOnce(undefined);
    mocks.createResearchJobAction.mockResolvedValueOnce({
      jobId: "018f0025-4100-7000-8000-000000000005",
      replayed: false,
    });
    const input = {
      mutationRequestId: crypto.randomUUID(),
      selectedProfileId: profileId,
      items: [{ query: "Producto Google", mode: "CREATE" as const }],
    };
    const result = await submitResearchJobAdminAction(input);
    expect(result.success).toBe(true);
    expect(mocks.assertResearchEligibility).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ authContext: expect.objectContaining({ status: "READY" }) })
    );
    expect(mocks.createResearchJobAction).toHaveBeenCalledWith(input);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a manipulated non-DRAFT ENRICH target before frozen job creation", async () => {
    mocks.assertResearchEligibility.mockRejectedValueOnce(
      new Error("AI_ENRICH_TARGET_NOT_DRAFT: target is not DRAFT")
    );
    const result = await submitResearchJobAdminAction({
      mutationRequestId: crypto.randomUUID(),
      selectedProfileId: profileId,
      items: [{ query: "Producto publicado", mode: "ENRICH", targetProductId: productId }],
    });
    expect(result).toMatchObject({ success: false, code: "AI_ENRICH_TARGET_NOT_DRAFT" });
    expect(mocks.createResearchJobAction).not.toHaveBeenCalled();
  });

  it.each(["openai", "anthropic"])(
    "rejects a manipulated %s health check before adapter invocation",
    async () => {
      mocks.assertHealthCheckSupported.mockRejectedValueOnce(
        new Error("AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED: no production adapter")
      );
      const result = await testCredentialAdminAction({ providerId });
      expect(result).toMatchObject({
        success: false,
        code: "AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED",
      });
      expect(mocks.executeCredentialHealthCheck).not.toHaveBeenCalled();
    }
  );

  it("allows an explicit supported Google health check to reach the approved service", async () => {
    mocks.assertHealthCheckSupported.mockResolvedValueOnce(undefined);
    mocks.executeCredentialHealthCheck.mockResolvedValueOnce({
      ok: true,
      status: "HEALTHY",
      code: "AI_PROVIDER_HEALTH_CHECK_OK",
      message: "Provider health check passed.",
    });
    const result = await testCredentialAdminAction({ providerId });
    expect(result).toMatchObject({ success: true, data: { status: "HEALTHY" } });
    expect(mocks.executeCredentialHealthCheck).toHaveBeenCalledWith(
      providerId,
      expect.objectContaining({ authContext: expect.objectContaining({ status: "READY" }) })
    );
  });

  it("prevents enabled unsupported profiles but permits storing them disabled", async () => {
    const enabledInput = {
      profileKey: "PRODUCT_RESEARCH_DEEP" as const,
      providerId,
      modelId: "future-model",
      temperature: "0.20",
      maxTokens: 4096,
      isEnabled: true,
    };
    mocks.assertProfileCompatibility.mockRejectedValueOnce(
      new Error("AI_PROFILE_PROVIDER_UNSUPPORTED: no research adapter")
    );
    expect(await configureProfileAdminAction(enabledInput)).toMatchObject({
      success: false,
      code: "AI_PROFILE_PROVIDER_UNSUPPORTED",
    });
    expect(mocks.configureProfile).not.toHaveBeenCalled();

    const disabledInput = { ...enabledInput, isEnabled: false };
    mocks.assertProfileCompatibility.mockResolvedValueOnce(undefined);
    mocks.configureProfile.mockResolvedValueOnce({ id: profileId });
    expect(await configureProfileAdminAction(disabledInput)).toMatchObject({ success: true });
    expect(mocks.configureProfile).toHaveBeenCalledWith(
      disabledInput,
      expect.objectContaining({ authContext: expect.objectContaining({ status: "READY" }) })
    );
  });
});
