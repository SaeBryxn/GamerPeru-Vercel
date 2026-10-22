import { z } from "zod";
import { computeRequestFingerprint } from "@/lib/admin/catalog/crypto";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";
import type { ProductPdpConfig } from "@/lib/catalog/product-pdp-config";
import {
  PROPOSAL_APPLY_STEP_STATUSES,
  ProposalApplyError,
  ProposalReviewError,
  type ApprovedProposalApplyProjection,
  type ProposalApplyMode,
  type ProposalApplyStepStatus,
} from "./types";

const UUID_SCHEMA = z.string().uuid();
const UUID_V7_SCHEMA = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const ISO_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });
const ATTRIBUTES_SCHEMA = z.record(z.string());

export const proposalApplyInputSchema = z.object({ proposalId: UUID_SCHEMA }).strict();

export const productCreateApplyPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200),
    brandId: UUID_SCHEMA,
    categoryId: UUID_SCHEMA,
    subtitle: z.string().trim().min(1).max(255).nullable(),
    description: z.string().trim().min(1).max(8_000).nullable(),
    isFeatured: z.literal(false),
  })
  .strict();

export const createProductUpdateApplyPayloadSchema = z
  .object({
    productId: UUID_SCHEMA,
    expectedUpdatedAt: ISO_TIMESTAMP_SCHEMA,
    specValues: z.record(z.unknown()),
    pdpConfig: productPdpConfigSchema.optional(),
  })
  .strict();

export const enrichProductUpdateApplyPayloadSchema = z
  .object({
    productId: UUID_SCHEMA,
    expectedUpdatedAt: ISO_TIMESTAMP_SCHEMA,
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200),
    brandId: UUID_SCHEMA,
    categoryId: UUID_SCHEMA,
    subtitle: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(8_000).optional(),
    specValues: z.record(z.unknown()),
    pdpConfig: productPdpConfigSchema.optional(),
  })
  .strict();

export const variantCreateApplyPayloadSchema = z
  .object({
    productId: UUID_SCHEMA,
    sku: z.string().trim().min(1).max(50),
    title: z.string().trim().min(1).max(150),
    priceCents: z.number().int().min(1).max(2_147_483_647),
    compareAtPriceCents: z.number().int().min(0).max(2_147_483_647).nullable(),
    costCents: z.number().int().min(0).max(2_147_483_647).nullable(),
    weightGrams: z.number().int().min(1).max(2_147_483_647).nullable(),
    attributes: ATTRIBUTES_SCHEMA,
    status: z.literal("ACTIVE"),
    displayOrder: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();

export const persistedApplyStepSchema = z
  .object({
    proposalId: UUID_SCHEMA,
    applyOperationId: UUID_V7_SCHEMA,
    applyActorAuthUserId: UUID_SCHEMA,
    stepKey: z.string().min(1).max(50),
    stepOrdinal: z.number().int().nonnegative(),
    mutationRequestId: z.string().min(1).max(128),
    requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    requestPayload: z.unknown(),
    stepStatus: z.enum(PROPOSAL_APPLY_STEP_STATUSES),
    targetId: UUID_SCHEMA.nullable(),
    errorMessage: z.string().max(240).nullable(),
    createdAt: ISO_TIMESTAMP_SCHEMA,
    updatedAt: ISO_TIMESTAMP_SCHEMA,
  })
  .strict();

export type ProductCreateApplyPayload = z.infer<typeof productCreateApplyPayloadSchema>;
export type CreateProductUpdateApplyPayload = z.infer<typeof createProductUpdateApplyPayloadSchema>;
export type EnrichProductUpdateApplyPayload = z.infer<typeof enrichProductUpdateApplyPayloadSchema>;
export type VariantCreateApplyPayload = z.infer<typeof variantCreateApplyPayloadSchema>;
export type PersistedApplyStep = z.infer<typeof persistedApplyStepSchema>;

export type ApplyStepKind =
  | { kind: "PRODUCT_CREATE" }
  | { kind: "PRODUCT_UPDATE" }
  | { kind: "VARIANT_CREATE"; index: number };

export interface RequiredApplyStep {
  stepKey: string;
  stepOrdinal: number;
}

export interface ApplyStepDefinition extends RequiredApplyStep {
  mutationRequestId: string;
  requestFingerprint: string;
  requestPayload: unknown;
}

export function parseApplyStepKey(stepKey: string): ApplyStepKind {
  if (stepKey === "PRODUCT_CREATE") return { kind: "PRODUCT_CREATE" };
  if (stepKey === "PRODUCT_UPDATE") return { kind: "PRODUCT_UPDATE" };
  const match = /^VARIANT_CREATE:(0|[1-9][0-9]*)$/.exec(stepKey);
  if (!match) throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  const index = Number(match[1]);
  if (!Number.isSafeInteger(index) || index > 99) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  return { kind: "VARIANT_CREATE", index };
}

export function expectedApplyStepOrdinal(mode: ProposalApplyMode, stepKey: string): number {
  const parsed = parseApplyStepKey(stepKey);
  if (parsed.kind === "PRODUCT_CREATE") {
    if (mode !== "CREATE") throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    return 0;
  }
  if (parsed.kind === "PRODUCT_UPDATE") return mode === "CREATE" ? 1 : 0;
  return (mode === "CREATE" ? 2 : 1) + parsed.index;
}

export function buildRequiredApplySteps(input: {
  mode: ProposalApplyMode;
  includeProductUpdate: boolean;
  variantCount: number;
}): RequiredApplyStep[] {
  if (!Number.isInteger(input.variantCount) || input.variantCount < 0 || input.variantCount > 100) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const steps: RequiredApplyStep[] = [];
  if (input.mode === "CREATE") {
    steps.push({ stepKey: "PRODUCT_CREATE", stepOrdinal: 0 });
    if (input.includeProductUpdate) {
      steps.push({ stepKey: "PRODUCT_UPDATE", stepOrdinal: 1 });
    }
  } else {
    if (!input.includeProductUpdate) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    steps.push({ stepKey: "PRODUCT_UPDATE", stepOrdinal: 0 });
  }
  for (let index = 0; index < input.variantCount; index += 1) {
    steps.push({
      stepKey: `VARIANT_CREATE:${index}`,
      stepOrdinal: (input.mode === "CREATE" ? 2 : 1) + index,
    });
  }
  return steps;
}

export function deriveApplyMutationRequestId(applyOperationId: string, stepKey: string): string {
  UUID_V7_SCHEMA.parse(applyOperationId);
  const parsed = parseApplyStepKey(stepKey);
  if (parsed.kind === "PRODUCT_CREATE") {
    return `ai-apply-${applyOperationId}-product-create`;
  }
  if (parsed.kind === "PRODUCT_UPDATE") {
    return `ai-apply-${applyOperationId}-product-update`;
  }
  return `ai-apply-${applyOperationId}-variant-create-${parsed.index}`;
}

function buildStepDefinition(
  applyOperationId: string,
  stepKey: string,
  stepOrdinal: number,
  requestPayload: unknown
): ApplyStepDefinition {
  return {
    stepKey,
    stepOrdinal,
    mutationRequestId: deriveApplyMutationRequestId(applyOperationId, stepKey),
    requestFingerprint: computeRequestFingerprint(requestPayload),
    requestPayload,
  };
}

function buildVariantDefinitions(
  applyOperationId: string,
  mode: ProposalApplyMode,
  productId: string,
  projection: ApprovedProposalApplyProjection
): ApplyStepDefinition[] {
  return projection.variants.map((variant, index) => {
    const stepKey = `VARIANT_CREATE:${index}`;
    const payload = variantCreateApplyPayloadSchema.parse({
      productId,
      sku: variant.sku,
      title: variant.title,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents,
      costCents: variant.costCents,
      weightGrams: variant.weightGrams,
      attributes: variant.attributes,
      status: "ACTIVE",
      displayOrder: variant.displayOrder,
    });
    return buildStepDefinition(
      applyOperationId,
      stepKey,
      expectedApplyStepOrdinal(mode, stepKey),
      payload
    );
  });
}

export function buildInitialApplyStepDefinitions(
  applyOperationId: string,
  projection: ApprovedProposalApplyProjection,
  pdpConfig?: ProductPdpConfig
): ApplyStepDefinition[] {
  if (projection.mode === "CREATE") {
    const requestPayload = productCreateApplyPayloadSchema.parse({
      name: projection.product.name,
      slug: projection.product.slug,
      brandId: projection.product.brandId,
      categoryId: projection.product.categoryId,
      subtitle: projection.product.subtitle ?? null,
      description: projection.product.description ?? null,
      isFeatured: false,
    });
    return [buildStepDefinition(applyOperationId, "PRODUCT_CREATE", 0, requestPayload)];
  }
  if (!projection.targetProductId || !projection.targetProductVersionSnapshot) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const productPayload = enrichProductUpdateApplyPayloadSchema.parse({
    productId: projection.targetProductId,
    expectedUpdatedAt: projection.targetProductVersionSnapshot,
    name: projection.product.name,
    slug: projection.product.slug,
    brandId: projection.product.brandId,
    categoryId: projection.product.categoryId,
    ...(projection.product.subtitle === undefined ? {} : { subtitle: projection.product.subtitle }),
    ...(projection.product.description === undefined
      ? {}
      : { description: projection.product.description }),
    specValues: projection.specifications,
    ...(pdpConfig === undefined ? {} : { pdpConfig }),
  });
  return [
    buildStepDefinition(applyOperationId, "PRODUCT_UPDATE", 0, productPayload),
    ...buildVariantDefinitions(applyOperationId, "ENRICH", projection.targetProductId, projection),
  ];
}

export function buildCreateDownstreamStepDefinitions(
  applyOperationId: string,
  projection: ApprovedProposalApplyProjection,
  productId: string,
  originalCreatedAt: string,
  pdpConfig?: ProductPdpConfig
): ApplyStepDefinition[] {
  if (projection.mode !== "CREATE") {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const definitions: ApplyStepDefinition[] = [];
  if (Object.keys(projection.specifications).length > 0 || pdpConfig !== undefined) {
    const productPayload = createProductUpdateApplyPayloadSchema.parse({
      productId,
      expectedUpdatedAt: originalCreatedAt,
      specValues: projection.specifications,
      ...(pdpConfig === undefined ? {} : { pdpConfig }),
    });
    definitions.push(buildStepDefinition(applyOperationId, "PRODUCT_UPDATE", 1, productPayload));
  }
  definitions.push(...buildVariantDefinitions(applyOperationId, "CREATE", productId, projection));
  return definitions;
}

export function parseApplyStepPayload(
  mode: ProposalApplyMode,
  stepKey: string,
  payload: unknown
):
  | ProductCreateApplyPayload
  | CreateProductUpdateApplyPayload
  | EnrichProductUpdateApplyPayload
  | VariantCreateApplyPayload {
  const parsed = parseApplyStepKey(stepKey);
  if (parsed.kind === "PRODUCT_CREATE") {
    if (mode !== "CREATE") throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    return productCreateApplyPayloadSchema.parse(payload);
  }
  if (parsed.kind === "PRODUCT_UPDATE") {
    return mode === "CREATE"
      ? createProductUpdateApplyPayloadSchema.parse(payload)
      : enrichProductUpdateApplyPayloadSchema.parse(payload);
  }
  return variantCreateApplyPayloadSchema.parse(payload);
}

export function assertApplyStepFingerprint(payload: unknown, fingerprint: string): void {
  if (computeRequestFingerprint(payload) !== fingerprint) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
}

export interface ClassifiedApplyFailure {
  status: Extract<ProposalApplyStepStatus, "FAILED_RETRYABLE" | "FAILED_TERMINAL">;
  code: string;
  message: string;
}

function boundedMessage(code: string, message: string): string {
  const safeCode = /^[A-Z0-9_]{1,80}$/.test(code) ? code : "APPLY_FAILURE";
  const safeMessage = message.replace(/\s+/g, " ").trim().slice(0, 140);
  return `${safeCode}: ${safeMessage || "La operación no pudo completarse."}`.slice(0, 240);
}

export function classifyApplyFailure(error: unknown): ClassifiedApplyFailure {
  if (error instanceof ProposalApplyError) {
    return {
      status:
        error.code === "AI_PROPOSAL_APPLY_FAILED_RETRYABLE"
          ? "FAILED_RETRYABLE"
          : "FAILED_TERMINAL",
      code: error.code,
      message: boundedMessage(error.code, error.message),
    };
  }
  if (error instanceof ProposalReviewError) {
    return {
      status: "FAILED_TERMINAL",
      code: error.code,
      message: boundedMessage(error.code, error.message),
    };
  }
  if (error instanceof CatalogDomainError) {
    return {
      status: "FAILED_TERMINAL",
      code: error.code,
      message: boundedMessage(error.code, error.message),
    };
  }
  return {
    status: "FAILED_RETRYABLE",
    code: "APPLY_OPERATION_RETRYABLE",
    message: boundedMessage(
      "APPLY_OPERATION_RETRYABLE",
      "La operación encontró un error operativo transitorio."
    ),
  };
}
