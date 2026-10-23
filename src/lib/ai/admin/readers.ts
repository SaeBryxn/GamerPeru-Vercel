import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { RESEARCH_PROVIDER_KEYS } from "@/lib/ai/gateway/registry";
import {
  aiProductProposals,
  aiProfiles,
  aiProviderCredentials,
  aiProviders,
  aiResearchJobItems,
  aiResearchJobs,
  brands,
  categories,
  products,
} from "@/db/schema";
import {
  ForbiddenError,
  requirePermission,
  type PermissionName,
  type VerifiedAuthContextReady,
} from "@/lib/auth/rbac";
import {
  ADMIN_AI_PROFILE_KEYS,
  ADMIN_AI_PROVIDER_KEYS,
  RESEARCH_ITEM_STATUSES,
  type AdminAiProfileDto,
  type AdminAiProviderCapabilityDto,
  type AdminAiProviderDto,
  type AdminAiSettingsDto,
  type AdminAiCredentialDto,
  type CatalogReferenceDto,
  type ResearchJobDetailDto,
  type ResearchJobItemDto,
  type ResearchJobSummaryDto,
  type ResearchProductOptionDto,
  type ResearchProfileOptionDto,
} from "./types";

interface AdminAiReaderOptions {
  authContext?: VerifiedAuthContextReady;
}

interface AdminResearchEligibilityInput {
  selectedProfileId: string;
  items: Array<{
    mode: "CREATE" | "ENRICH";
    targetProductId?: string | null;
  }>;
}

async function requireReaderPermission(
  permission: PermissionName,
  options?: AdminAiReaderOptions
): Promise<VerifiedAuthContextReady> {
  if (!options?.authContext) return await requirePermission(permission);
  if (!options.authContext.permissions.has(permission)) {
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }
  return options.authContext;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function getProviderRuntimeCapability(
  providerKey: string
): Omit<AdminAiProviderCapabilityDto, "providerKey"> {
  const supported = (RESEARCH_PROVIDER_KEYS as readonly string[]).includes(providerKey);
  return {
    researchExecutionSupported: supported,
    healthCheckSupported: supported,
  };
}

async function getProviderRuntimeRow(providerId: string): Promise<{
  providerKey: string;
  isEnabled: boolean;
} | null> {
  const [provider] = await db
    .select({ providerKey: aiProviders.providerKey, isEnabled: aiProviders.isEnabled })
    .from(aiProviders)
    .where(eq(aiProviders.id, providerId))
    .limit(1);
  return provider ?? null;
}

export async function assertAdminResearchSubmissionEligibility(
  input: AdminResearchEligibilityInput,
  options?: AdminAiReaderOptions
): Promise<void> {
  await requireReaderPermission("catalog:ai_research", options);
  const [profile] = await db
    .select({
      isEnabled: aiProfiles.isEnabled,
      providerEnabled: aiProviders.isEnabled,
      providerKey: aiProviders.providerKey,
    })
    .from(aiProfiles)
    .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
    .where(eq(aiProfiles.id, input.selectedProfileId))
    .limit(1);

  if (!profile?.isEnabled) {
    throw new Error("AI_PROFILE_DISABLED: Selected AI profile is unavailable.");
  }
  if (!profile.providerEnabled) {
    throw new Error("AI_PROVIDER_DISABLED: Selected AI provider is unavailable.");
  }
  if (!getProviderRuntimeCapability(profile.providerKey).researchExecutionSupported) {
    throw new Error(
      "AI_RESEARCH_PROVIDER_UNSUPPORTED: Selected provider has no GP-025 research adapter."
    );
  }

  const targetIds = [
    ...new Set(
      input.items
        .filter((item) => item.mode === "ENRICH")
        .map((item) => item.targetProductId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  if (targetIds.length === 0) return;

  const targetRows = await db
    .select({ id: products.id, status: products.status })
    .from(products)
    .where(inArray(products.id, targetIds));
  const targetById = new Map(targetRows.map((target) => [target.id, target.status]));
  for (const targetId of targetIds) {
    const status = targetById.get(targetId);
    if (!status) {
      throw new Error("AI_TARGET_PRODUCT_NOT_FOUND: ENRICH target product does not exist.");
    }
    if (status !== "DRAFT") {
      throw new Error(
        "AI_ENRICH_TARGET_NOT_DRAFT: ENRICH target must currently be a DRAFT Product."
      );
    }
  }
}

export async function assertAdminProfileRuntimeCompatibility(
  input: { providerId: string; isEnabled: boolean },
  options?: AdminAiReaderOptions
): Promise<void> {
  await requireReaderPermission("ai:manage_credentials", options);
  if (!input.isEnabled) return;
  const provider = await getProviderRuntimeRow(input.providerId);
  if (!provider) {
    throw new Error("PROVIDER_NOT_FOUND: Selected provider does not exist.");
  }
  if (!getProviderRuntimeCapability(provider.providerKey).researchExecutionSupported) {
    throw new Error(
      "AI_PROFILE_PROVIDER_UNSUPPORTED: Enabled GP-025 profiles require a research adapter."
    );
  }
}

export async function assertAdminProviderHealthCheckSupported(
  providerId: string,
  options?: AdminAiReaderOptions
): Promise<void> {
  await requireReaderPermission("ai:manage_credentials", options);
  const provider = await getProviderRuntimeRow(providerId);
  if (!provider) {
    throw new Error("PROVIDER_NOT_FOUND: Selected provider does not exist.");
  }
  if (!getProviderRuntimeCapability(provider.providerKey).healthCheckSupported) {
    throw new Error(
      "AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED: Provider has no production health-check adapter."
    );
  }
}

function safeResearchError(code: string | null): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    AI_SEARCH_CONFIG_MISSING: "La búsqueda no está configurada.",
    AI_SEARCH_AUTH_FAILED: "La búsqueda no pudo autenticarse.",
    AI_SEARCH_RATE_LIMITED: "La búsqueda alcanzó temporalmente su límite.",
    AI_SEARCH_UNAVAILABLE: "La búsqueda no está disponible temporalmente.",
    AI_SEARCH_NO_USABLE_EVIDENCE: "No se encontró evidencia utilizable.",
    AI_FETCH_POLICY_BLOCKED: "Una fuente fue bloqueada por la política de adquisición.",
    AI_EVIDENCE_CHANGED: "La evidencia externa cambió durante la recuperación.",
    AI_PROVIDER_DISABLED: "El proveedor configurado no está disponible.",
    AI_PROFILE_DISABLED: "El perfil configurado no está disponible.",
    AI_PROVIDER_AUTH_FAILED: "El proveedor no pudo autenticarse.",
    AI_PROVIDER_RATE_LIMITED: "El proveedor alcanzó temporalmente su límite.",
    AI_PROVIDER_UNAVAILABLE: "El proveedor no está disponible temporalmente.",
    AI_PROVIDER_RESPONSE_INVALID: "El proveedor devolvió una respuesta no válida.",
    LEASE_LOST: "El trabajo perdió su turno de procesamiento y será recuperado.",
  };
  return messages[code] ?? "La investigación no pudo completarse.";
}

function parseJobType(value: string): "SINGLE" | "BATCH" {
  return value === "BATCH" ? "BATCH" : "SINGLE";
}

function parseJobStatus(value: string): ResearchJobSummaryDto["jobStatus"] {
  return ["QUEUED", "PROCESSING", "COMPLETED", "PARTIALLY_FAILED", "FAILED"].includes(value)
    ? (value as ResearchJobSummaryDto["jobStatus"])
    : "FAILED";
}

function parseDispatchStatus(value: string): ResearchJobSummaryDto["dispatchStatus"] {
  return ["PENDING_DISPATCH", "DISPATCHED", "DISPATCH_FAILED"].includes(value)
    ? (value as ResearchJobSummaryDto["dispatchStatus"])
    : "DISPATCH_FAILED";
}

function parseItemStatus(value: string): ResearchJobItemDto["status"] {
  return RESEARCH_ITEM_STATUSES.includes(value as ResearchJobItemDto["status"])
    ? (value as ResearchJobItemDto["status"])
    : "FAILED";
}

export async function getResearchWorkspaceBootstrap(options?: AdminAiReaderOptions): Promise<{
  profiles: ResearchProfileOptionDto[];
  products: ResearchProductOptionDto[];
  recentJobs: ResearchJobSummaryDto[];
}> {
  await requireReaderPermission("catalog:ai_research", options);
  const [profiles, productRows, recentJobs] = await Promise.all([
    db
      .select({
        id: aiProfiles.id,
        profileKey: aiProfiles.profileKey,
        modelId: aiProfiles.modelId,
        isEnabled: aiProfiles.isEnabled,
        providerDisplayName: aiProviders.displayName,
        providerEnabled: aiProviders.isEnabled,
        providerKey: aiProviders.providerKey,
      })
      .from(aiProfiles)
      .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
      .orderBy(asc(aiProfiles.profileKey))
      .limit(50),
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        status: products.status,
      })
      .from(products)
      .where(eq(products.status, "DRAFT"))
      .orderBy(asc(products.name), asc(products.id))
      .limit(100),
    getRecentResearchJobs(20, options),
  ]);
  return {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      profileKey: profile.profileKey,
      modelId: profile.modelId,
      isEnabled: profile.isEnabled,
      providerDisplayName: profile.providerDisplayName,
      providerEnabled: profile.providerEnabled,
      researchExecutionSupported: getProviderRuntimeCapability(profile.providerKey)
        .researchExecutionSupported,
    })),
    products: productRows.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: "DRAFT" as const,
    })),
    recentJobs,
  };
}

export async function getRecentResearchJobs(
  limit = 20,
  options?: AdminAiReaderOptions
): Promise<ResearchJobSummaryDto[]> {
  await requireReaderPermission("catalog:ai_research", options);
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const rows = await db
    .select({
      jobId: aiResearchJobs.id,
      jobType: aiResearchJobs.jobType,
      jobStatus: aiResearchJobs.status,
      dispatchStatus: aiResearchJobs.dispatchStatus,
      totalItems: aiResearchJobs.totalItems,
      completedItems: aiResearchJobs.completedItems,
      failedItems: aiResearchJobs.failedItems,
      profileSnapshot: aiResearchJobs.profileSnapshot,
      providerDisplayName: aiProviders.displayName,
      createdAt: aiResearchJobs.createdAt,
      updatedAt: aiResearchJobs.updatedAt,
      reviewableItems: sql<number>`count(*) filter (where ${aiResearchJobItems.status} in ('READY_FOR_REVIEW', 'SOURCE_CONFLICT', 'NEEDS_ATTENTION', 'AMBIGUOUS'))`,
      activeItems: sql<number>`count(*) filter (where ${aiResearchJobItems.status} in ('PENDING', 'RESEARCHING'))`,
    })
    .from(aiResearchJobs)
    .innerJoin(aiProfiles, eq(aiResearchJobs.selectedProfileId, aiProfiles.id))
    .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
    .leftJoin(aiResearchJobItems, eq(aiResearchJobs.id, aiResearchJobItems.jobId))
    .groupBy(aiResearchJobs.id, aiProviders.displayName)
    .orderBy(desc(aiResearchJobs.createdAt))
    .limit(boundedLimit);
  return rows.map((row) => {
    const snapshot = row.profileSnapshot as Record<string, unknown>;
    return {
      jobId: row.jobId,
      jobType: parseJobType(row.jobType),
      jobStatus: parseJobStatus(row.jobStatus),
      dispatchStatus: parseDispatchStatus(row.dispatchStatus),
      totalItems: row.totalItems,
      completedItems: row.completedItems,
      failedItems: row.failedItems,
      reviewableItems: Number(row.reviewableItems ?? 0),
      activeItems: Number(row.activeItems ?? 0),
      profileKey: typeof snapshot.profileKey === "string" ? snapshot.profileKey : "Perfil",
      providerDisplayName: row.providerDisplayName,
      modelId: typeof snapshot.modelId === "string" ? snapshot.modelId : "Modelo no disponible",
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  });
}

export async function getResearchJobDetail(
  jobId: string,
  options?: AdminAiReaderOptions
): Promise<ResearchJobDetailDto | null> {
  await requireReaderPermission("catalog:ai_research", options);
  const summary = (
    await db
      .select({
        jobId: aiResearchJobs.id,
        jobType: aiResearchJobs.jobType,
        jobStatus: aiResearchJobs.status,
        dispatchStatus: aiResearchJobs.dispatchStatus,
        totalItems: aiResearchJobs.totalItems,
        completedItems: aiResearchJobs.completedItems,
        failedItems: aiResearchJobs.failedItems,
        profileSnapshot: aiResearchJobs.profileSnapshot,
        providerDisplayName: aiProviders.displayName,
        createdAt: aiResearchJobs.createdAt,
        updatedAt: aiResearchJobs.updatedAt,
      })
      .from(aiResearchJobs)
      .innerJoin(aiProfiles, eq(aiResearchJobs.selectedProfileId, aiProfiles.id))
      .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
      .where(eq(aiResearchJobs.id, jobId))
      .limit(1)
  )[0];
  if (!summary) return null;
  const itemRows = await db
    .select({
      itemId: aiResearchJobItems.id,
      itemIndex: aiResearchJobItems.itemIndex,
      inputQuery: aiResearchJobItems.inputQuery,
      mode: aiResearchJobItems.mode,
      targetProductId: aiResearchJobItems.targetProductId,
      targetProductName: products.name,
      identityStatus: aiResearchJobItems.identityStatus,
      status: aiResearchJobItems.status,
      errorCode: aiResearchJobItems.errorCode,
      proposalId: aiProductProposals.id,
      proposalStatus: aiProductProposals.status,
      updatedAt: aiResearchJobItems.updatedAt,
    })
    .from(aiResearchJobItems)
    .leftJoin(products, eq(aiResearchJobItems.targetProductId, products.id))
    .leftJoin(aiProductProposals, eq(aiProductProposals.jobItemId, aiResearchJobItems.id))
    .where(eq(aiResearchJobItems.jobId, jobId))
    .orderBy(asc(aiResearchJobItems.itemIndex));
  const items: ResearchJobItemDto[] = itemRows.map((item) => ({
    itemId: item.itemId,
    itemIndex: item.itemIndex,
    inputQuery: item.inputQuery,
    mode: item.mode === "ENRICH" ? "ENRICH" : "CREATE",
    targetProductId: item.targetProductId,
    targetProductName: item.targetProductName,
    identityStatus: item.identityStatus,
    status: parseItemStatus(item.status),
    errorCode: item.errorCode,
    errorMessage: safeResearchError(item.errorCode),
    proposalId: item.proposalId,
    proposalStatus: item.proposalStatus as ResearchJobItemDto["proposalStatus"],
    updatedAt: toIso(item.updatedAt),
  }));
  const snapshot = summary.profileSnapshot as Record<string, unknown>;
  return {
    jobId: summary.jobId,
    jobType: parseJobType(summary.jobType),
    jobStatus: parseJobStatus(summary.jobStatus),
    dispatchStatus: parseDispatchStatus(summary.dispatchStatus),
    totalItems: summary.totalItems,
    completedItems: summary.completedItems,
    failedItems: summary.failedItems,
    reviewableItems: items.filter((item) =>
      ["READY_FOR_REVIEW", "SOURCE_CONFLICT", "NEEDS_ATTENTION", "AMBIGUOUS"].includes(item.status)
    ).length,
    activeItems: items.filter((item) => ["PENDING", "RESEARCHING"].includes(item.status)).length,
    profileKey: typeof snapshot.profileKey === "string" ? snapshot.profileKey : "Perfil",
    providerDisplayName: summary.providerDisplayName,
    modelId: typeof snapshot.modelId === "string" ? snapshot.modelId : "Modelo no disponible",
    createdAt: toIso(summary.createdAt),
    updatedAt: toIso(summary.updatedAt),
    items,
  };
}

export async function getProposalCatalogReferences(
  options?: AdminAiReaderOptions
): Promise<{ brands: CatalogReferenceDto[]; categories: CatalogReferenceDto[] }> {
  await requireReaderPermission("catalog:ai_research", options);
  const [brandRows, categoryRows] = await Promise.all([
    db
      .select({ id: brands.id, name: brands.name, slug: brands.slug })
      .from(brands)
      .where(eq(brands.status, "PUBLISHED"))
      .orderBy(asc(brands.name))
      .limit(200),
    db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.status, "PUBLISHED"))
      .orderBy(asc(categories.displayOrder), asc(categories.name))
      .limit(200),
  ]);
  return { brands: brandRows, categories: categoryRows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function getAdminAiSettings(
  options?: AdminAiReaderOptions
): Promise<AdminAiSettingsDto> {
  await requireReaderPermission("ai:manage_credentials", options);
  const [providerRows, credentialRows, profileRows] = await Promise.all([
    db
      .select({
        id: aiProviders.id,
        providerKey: aiProviders.providerKey,
        displayName: aiProviders.displayName,
        isEnabled: aiProviders.isEnabled,
        isDefault: aiProviders.isDefault,
        settings: aiProviders.settings,
        updatedAt: aiProviders.updatedAt,
      })
      .from(aiProviders)
      .where(inArray(aiProviders.providerKey, [...ADMIN_AI_PROVIDER_KEYS]))
      .orderBy(asc(aiProviders.providerKey))
      .limit(ADMIN_AI_PROVIDER_KEYS.length),
    db
      .select({
        id: aiProviderCredentials.id,
        providerId: aiProviderCredentials.providerId,
        maskedKey: aiProviderCredentials.maskedKey,
        status: aiProviderCredentials.status,
        keyVersion: aiProviderCredentials.keyVersion,
        lastHealthStatus: aiProviderCredentials.lastHealthStatus,
        lastTestedAt: aiProviderCredentials.lastTestedAt,
        createdAt: aiProviderCredentials.createdAt,
        updatedAt: aiProviderCredentials.updatedAt,
      })
      .from(aiProviderCredentials)
      .innerJoin(aiProviders, eq(aiProviderCredentials.providerId, aiProviders.id))
      .where(
        and(
          eq(aiProviderCredentials.status, "ACTIVE"),
          inArray(aiProviders.providerKey, [...ADMIN_AI_PROVIDER_KEYS])
        )
      )
      .orderBy(desc(aiProviderCredentials.updatedAt))
      .limit(ADMIN_AI_PROVIDER_KEYS.length),
    db
      .select({
        id: aiProfiles.id,
        profileKey: aiProfiles.profileKey,
        providerId: aiProfiles.providerId,
        providerDisplayName: aiProviders.displayName,
        providerKey: aiProviders.providerKey,
        modelId: aiProfiles.modelId,
        temperature: aiProfiles.temperature,
        maxTokens: aiProfiles.maxTokens,
        isEnabled: aiProfiles.isEnabled,
        updatedAt: aiProfiles.updatedAt,
      })
      .from(aiProfiles)
      .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
      .where(inArray(aiProfiles.profileKey, [...ADMIN_AI_PROFILE_KEYS]))
      .orderBy(asc(aiProfiles.profileKey))
      .limit(ADMIN_AI_PROFILE_KEYS.length),
  ]);
  const credentialByProvider = new Map<string, AdminAiCredentialDto>(
    credentialRows.map((credential) => [
      credential.providerId,
      {
        id: credential.id,
        providerId: credential.providerId,
        maskedKey: credential.maskedKey,
        status: credential.status as "ACTIVE" | "REVOKED",
        keyVersion: credential.keyVersion,
        lastHealthStatus: credential.lastHealthStatus as AdminAiCredentialDto["lastHealthStatus"],
        lastTestedAt: credential.lastTestedAt ? toIso(credential.lastTestedAt) : null,
        createdAt: toIso(credential.createdAt),
        updatedAt: toIso(credential.updatedAt),
      },
    ])
  );
  const providers: AdminAiProviderDto[] = providerRows.map((provider) => ({
    id: provider.id,
    providerKey: provider.providerKey as AdminAiProviderDto["providerKey"],
    displayName: provider.displayName,
    isEnabled: provider.isEnabled,
    isDefault: provider.isDefault,
    settings: isRecord(provider.settings) ? provider.settings : {},
    ...getProviderRuntimeCapability(provider.providerKey),
    updatedAt: toIso(provider.updatedAt),
    credential: credentialByProvider.get(provider.id) ?? null,
  }));
  const profiles: AdminAiProfileDto[] = profileRows.map((profile) => ({
    id: profile.id,
    profileKey: profile.profileKey as AdminAiProfileDto["profileKey"],
    providerId: profile.providerId,
    providerDisplayName: profile.providerDisplayName,
    modelId: profile.modelId,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    isEnabled: profile.isEnabled,
    researchExecutionSupported: getProviderRuntimeCapability(profile.providerKey)
      .researchExecutionSupported,
    updatedAt: toIso(profile.updatedAt),
  }));
  const providerCapabilities: AdminAiProviderCapabilityDto[] = ADMIN_AI_PROVIDER_KEYS.map(
    (providerKey) => ({
      providerKey,
      ...getProviderRuntimeCapability(providerKey),
    })
  );
  return { providers, profiles, providerCapabilities };
}

export interface ProductAutofillContextDto {
  /** Research profile to run "Autocompletar" with; null when none is configured and enabled. */
  profileId: string | null;
  /** Latest research run on this product, so a reload picks up where it left off. */
  latestJobId: string | null;
}

/** What the product editor needs to offer filling the product from the web. */
export async function getProductAutofillContext(
  productId: string,
  options?: AdminAiReaderOptions
): Promise<ProductAutofillContextDto> {
  await requireReaderPermission("catalog:ai_research", options);
  const [profiles, [latest]] = await Promise.all([
    db
      .select({
        id: aiProfiles.id,
        profileKey: aiProfiles.profileKey,
        providerKey: aiProviders.providerKey,
        providerDefault: aiProviders.isDefault,
      })
      .from(aiProfiles)
      .innerJoin(aiProviders, eq(aiProfiles.providerId, aiProviders.id))
      .where(
        and(
          eq(aiProfiles.isEnabled, true),
          eq(aiProviders.isEnabled, true),
          inArray(aiProfiles.profileKey, ["PRODUCT_RESEARCH_FAST", "PRODUCT_RESEARCH_DEEP"])
        )
      ),
    db
      .select({ jobId: aiResearchJobItems.jobId })
      .from(aiResearchJobItems)
      .where(eq(aiResearchJobItems.targetProductId, productId))
      .orderBy(desc(aiResearchJobItems.createdAt))
      .limit(1),
  ]);
  const usable = profiles.filter((profile) =>
    (RESEARCH_PROVIDER_KEYS as readonly string[]).includes(profile.providerKey)
  );
  const profile =
    usable.find(
      (candidate) => candidate.providerDefault && candidate.profileKey === "PRODUCT_RESEARCH_FAST"
    ) ??
    usable.find((candidate) => candidate.providerDefault) ??
    usable.find((candidate) => candidate.profileKey === "PRODUCT_RESEARCH_FAST") ??
    usable[0];
  return { profileId: profile?.id ?? null, latestJobId: latest?.jobId ?? null };
}
