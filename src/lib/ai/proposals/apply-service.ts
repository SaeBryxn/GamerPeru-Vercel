import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requirePermission, ForbiddenError } from "@/lib/auth/rbac";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  canonicalSerialize,
  computeMutationRequestDigest,
  computeRequestFingerprint,
} from "@/lib/admin/catalog/crypto";
import { createProduct, createVariant, updateProduct } from "@/lib/admin/catalog/service";
import { isPlainRecord } from "@/lib/admin/catalog/record";
import type { Product, ProductVariant } from "@/db/schema";
import {
  formatDimensions,
  parseProductPdpConfig,
  productPdpConfigSchema,
} from "@/lib/catalog/product-pdp-config";
import { pdpProposalFieldsSchema } from "./schemas";
import { AI_AUDIT_ACTIONS } from "../audit-actions";
import {
  assertApplyStepFingerprint,
  buildCreateDownstreamStepDefinitions,
  buildInitialApplyStepDefinitions,
  buildRequiredApplySteps,
  classifyApplyFailure,
  createProductUpdateApplyPayloadSchema,
  deriveApplyMutationRequestId,
  enrichProductUpdateApplyPayloadSchema,
  expectedApplyStepOrdinal,
  parseApplyStepKey,
  parseApplyStepPayload,
  persistedApplyStepSchema,
  productCreateApplyPayloadSchema,
  proposalApplyInputSchema,
  variantCreateApplyPayloadSchema,
  type ApplyStepDefinition,
  type PersistedApplyStep,
  type VariantCreateApplyPayload,
} from "./apply-schemas";
import { deriveApprovedProposalApplyProjection } from "./review-service";
import {
  ProposalApplyError,
  type ApprovedProposalApplyProjection,
  type ProposalApplyMode,
  type ProposalApplyResult,
  type ProposalApplyServiceOptions,
  type ProposalApplyStatusDto,
  type ProposalApplyStepDto,
} from "./types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** Only accepted review fields enter this merge; other content and switches are preserved. */
export function mergeAcceptedStorePage(existing: unknown, acceptedFields: Record<string, unknown>) {
  const fields = pdpProposalFieldsSchema.parse(acceptedFields);
  const config = parseProductPdpConfig(existing);
  // New products have no explicit switches yet. Do not enable their empty blocks by default.
  if (!isPlainRecord(existing) || !Object.hasOwn(existing, "dimensionsEnabled"))
    config.dimensionsEnabled = false;
  if (!isPlainRecord(existing) || !Object.hasOwn(existing, "specificationsEnabled"))
    config.specificationsEnabled = false;
  if (fields["pdp.sizes"] !== undefined) {
    const sizes = fields["pdp.sizes"];
    config.sizeGuide.sizes = sizes;
    config.sizeGuide.enabled = sizes.some(
      (size) =>
        size.name.trim() &&
        (size.weight.trim() ||
          size.lengthMm !== null ||
          size.widthMm !== null ||
          size.heightMm !== null ||
          size.handMin !== null ||
          size.handMax !== null)
    );
    config.dimensionsEnabled = sizes.some(
      (size) => size.name.trim() && Boolean(formatDimensions(size) ?? size.weight.trim())
    );
  }
  if (fields["pdp.packageContents"] !== undefined) {
    config.packageContents.editions = fields["pdp.packageContents"].map((edition) => ({
      name: edition.edition,
      badge: "neutral",
      items: edition.items.map((item) => ({
        name: item.name,
        quantity: item.quantity ?? "",
        note: item.note ?? "",
      })),
    }));
    config.packageContents.enabled = config.packageContents.editions.some((edition) =>
      edition.items.some((item) => item.name.trim())
    );
  }
  if (fields["pdp.highlights"] !== undefined) {
    config.specifications = fields["pdp.highlights"];
    config.specificationsEnabled = config.specifications.some(
      (row) => row.label.trim() && row.value.trim()
    );
  }
  for (const key of ["warranty", "manualUrl", "driverUrl"] as const) {
    const value = fields[`pdp.support.${key}`];
    if (value !== undefined) config.support[key] = value;
  }
  return productPdpConfigSchema.parse(config);
}

async function mergedPdpForProjection(
  executor: Executor,
  projection: ApprovedProposalApplyProjection
) {
  if (!projection.pdpFields || Object.keys(projection.pdpFields).length === 0) return undefined;
  if (projection.mode === "CREATE") return mergeAcceptedStorePage({}, projection.pdpFields);
  const [product] = rows<{ pdp_config: unknown }>(
    await executor.execute(sql`
    SELECT pdp_config FROM products WHERE id = ${projection.targetProductId}::uuid LIMIT 1
  `)
  );
  if (!product) throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  return mergeAcceptedStorePage(product.pdp_config, projection.pdpFields);
}

interface ApplyProposalRow {
  id: string;
  job_item_id: string;
  status: string;
  applied_product_id: string | null;
  applied_at: Date | string | null;
  item_status: string;
  item_mode: string;
  target_product_id: string | null;
}

interface ApplyStepRow {
  proposal_id: string;
  apply_operation_id: string;
  apply_actor_auth_user_id: string;
  step_key: string;
  step_ordinal: number;
  mutation_request_id: string;
  request_fingerprint: string;
  request_payload: unknown;
  step_status: string;
  target_id: string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ValidatedOperation {
  proposal: ApplyProposalRow;
  projection: ApprovedProposalApplyProjection;
  steps: PersistedApplyStep[];
  applyOperationId: string;
  applyActorAuthUserId: string;
}

function rows<T>(result: unknown): T[] {
  return result as T[];
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

async function resolveApplyActor(
  options?: ProposalApplyServiceOptions
): Promise<VerifiedAuthContextReady> {
  const actor = options?.authContext ?? (await requirePermission("catalog:manage"));
  if (!actor.permissions.has("catalog:manage")) {
    throw new ForbiddenError("Missing catalog:manage permission.");
  }
  return actor;
}

async function loadApplyProposal(
  executor: Executor,
  proposalId: string,
  lock = false
): Promise<ApplyProposalRow> {
  const [proposal] = rows<ApplyProposalRow>(
    await executor.execute(sql`
      SELECT proposal.id, proposal.job_item_id, proposal.status,
        proposal.applied_product_id, proposal.applied_at,
        item.status AS item_status, item.mode AS item_mode, item.target_product_id
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      WHERE proposal.id = ${proposalId}::uuid
      ${lock ? sql`FOR UPDATE OF proposal, item` : sql``}
      LIMIT 1
    `)
  );
  if (!proposal) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_NOT_FOUND", undefined, 404);
  }
  return proposal;
}

async function loadApplySteps(
  executor: Executor,
  proposalId: string,
  lock = false
): Promise<ApplyStepRow[]> {
  return rows<ApplyStepRow>(
    await executor.execute(sql`
      SELECT proposal_id, apply_operation_id, apply_actor_auth_user_id, step_key,
        step_ordinal, mutation_request_id, request_fingerprint, request_payload,
        step_status, target_id, error_message, created_at, updated_at
      FROM ai_proposal_apply_steps
      WHERE proposal_id = ${proposalId}::uuid
      ORDER BY step_ordinal, step_key
      ${lock ? sql`FOR UPDATE` : sql``}
    `)
  );
}

function mapPersistedStep(row: ApplyStepRow): PersistedApplyStep {
  const parsed = persistedApplyStepSchema.safeParse({
    proposalId: row.proposal_id,
    applyOperationId: row.apply_operation_id,
    applyActorAuthUserId: row.apply_actor_auth_user_id,
    stepKey: row.step_key,
    stepOrdinal: Number(row.step_ordinal),
    mutationRequestId: row.mutation_request_id,
    requestFingerprint: row.request_fingerprint,
    requestPayload: row.request_payload,
    stepStatus: row.step_status,
    targetId: row.target_id,
    errorMessage: row.error_message,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
  if (!parsed.success) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  return parsed.data;
}

async function insertStep(
  tx: Transaction,
  proposalId: string,
  applyOperationId: string,
  actorId: string,
  definition: ApplyStepDefinition
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ai_proposal_apply_steps (
      id, proposal_id, apply_operation_id, apply_actor_auth_user_id,
      step_key, step_ordinal, mutation_request_id, request_fingerprint,
      request_payload, step_status, target_id, error_message, created_at, updated_at
    ) VALUES (
      ${generateUuidV7()}::uuid, ${proposalId}::uuid, ${applyOperationId}::uuid,
      ${actorId}::uuid, ${definition.stepKey}, ${definition.stepOrdinal},
      ${definition.mutationRequestId}, ${definition.requestFingerprint},
      ${JSON.stringify(definition.requestPayload)}::jsonb, 'PREPARED', NULL, NULL, NOW(), NOW()
    )
  `);
}

function validateStep(
  mode: ProposalApplyMode,
  row: ApplyStepRow,
  applyOperationId: string,
  actorId: string
): PersistedApplyStep {
  const step = mapPersistedStep(row);
  if (
    step.applyOperationId !== applyOperationId ||
    step.applyActorAuthUserId !== actorId ||
    step.stepOrdinal !== expectedApplyStepOrdinal(mode, step.stepKey) ||
    step.mutationRequestId !== deriveApplyMutationRequestId(applyOperationId, step.stepKey)
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  try {
    parseApplyStepPayload(mode, step.stepKey, step.requestPayload);
  } catch {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  assertApplyStepFingerprint(step.requestPayload, step.requestFingerprint);
  if (step.stepStatus === "COMMITTED") {
    if (!step.targetId || step.errorMessage !== null) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
  } else if (step.targetId !== null) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const isFailed = step.stepStatus === "FAILED_RETRYABLE" || step.stepStatus === "FAILED_TERMINAL";
  if (isFailed !== (step.errorMessage !== null)) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  return step;
}

function assertExactStepSet(
  projection: ApprovedProposalApplyProjection,
  steps: PersistedApplyStep[]
): void {
  const expected = buildRequiredApplySteps({
    mode: projection.mode,
    includeProductUpdate:
      projection.mode === "ENRICH" ||
      Object.keys(projection.specifications).length > 0 ||
      Object.keys(projection.pdpFields ?? {}).length > 0,
    variantCount: projection.variants.length,
  });
  const startupCreate =
    projection.mode === "CREATE" &&
    steps.length === 1 &&
    steps[0]?.stepKey === "PRODUCT_CREATE" &&
    steps[0].stepStatus !== "COMMITTED";
  if (startupCreate) return;
  if (
    steps.length !== expected.length ||
    expected.some(
      (definition, index) =>
        steps[index]?.stepKey !== definition.stepKey ||
        steps[index]?.stepOrdinal !== definition.stepOrdinal
    )
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
}

async function validateOperation(
  tx: Transaction,
  proposal: ApplyProposalRow,
  rawSteps: ApplyStepRow[],
  currentActorId?: string
): Promise<ValidatedOperation> {
  if (proposal.status !== "APPLYING" && proposal.status !== "APPLIED") {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  if (rawSteps.length === 0) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const operationIds = new Set(rawSteps.map((step) => step.apply_operation_id));
  const actorIds = new Set(rawSteps.map((step) => step.apply_actor_auth_user_id));
  if (operationIds.size !== 1 || actorIds.size !== 1) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const applyOperationId = rawSteps[0]?.apply_operation_id;
  const applyActorAuthUserId = rawSteps[0]?.apply_actor_auth_user_id;
  if (!applyOperationId || !applyActorAuthUserId) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  if (currentActorId !== undefined && currentActorId !== applyActorAuthUserId) {
    throw new ProposalApplyError("APPLY_ACTOR_MISMATCH", undefined, 403);
  }
  if (proposal.item_mode !== "CREATE" && proposal.item_mode !== "ENRICH") {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const projection = await deriveApprovedProposalApplyProjection(tx, proposal.id, proposal.status);
  const steps = rawSteps.map((step) =>
    validateStep(projection.mode, step, applyOperationId, applyActorAuthUserId)
  );
  const keys = new Set(steps.map((step) => step.stepKey));
  const ordinals = new Set(steps.map((step) => step.stepOrdinal));
  if (keys.size !== steps.length || ordinals.size !== steps.length) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  let nonCommittedSeen = false;
  for (const step of steps) {
    if (step.stepStatus !== "COMMITTED") nonCommittedSeen = true;
    if (nonCommittedSeen && step.stepStatus === "COMMITTED") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
  }
  assertExactStepSet(projection, steps);
  return {
    proposal,
    projection,
    steps,
    applyOperationId,
    applyActorAuthUserId,
  };
}

async function initializeOrLoadApply(
  proposalId: string,
  actor: VerifiedAuthContextReady
): Promise<ProposalApplyResult | null> {
  return await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    if (proposal.status === "DRAFT" || proposal.status === "REJECTED") {
      throw new ProposalApplyError("AI_PROPOSAL_NOT_APPLICABLE");
    }
    if (proposal.status === "APPROVED") {
      if (
        proposal.item_status !== "APPROVED" ||
        proposal.applied_product_id !== null ||
        proposal.applied_at !== null
      ) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      const existingSteps = await loadApplySteps(tx, proposal.id, true);
      if (existingSteps.length !== 0) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      const projection = await deriveApprovedProposalApplyProjection(tx, proposal.id, "APPROVED");
      const applyOperationId = generateUuidV7();
      const definitions = buildInitialApplyStepDefinitions(
        applyOperationId,
        projection,
        await mergedPdpForProjection(tx, projection)
      );
      for (const definition of definitions) {
        await insertStep(tx, proposal.id, applyOperationId, actor.authUserId, definition);
      }
      const [updated] = rows<{ id: string }>(
        await tx.execute(sql`
        UPDATE ai_product_proposals
        SET status = 'APPLYING',
            updated_at = GREATEST(
              date_trunc('milliseconds', clock_timestamp()),
              date_trunc('milliseconds', updated_at) + interval '1 millisecond'
            )
        WHERE id = ${proposal.id}::uuid AND status = 'APPROVED'
        RETURNING id
      `)
      );
      if (!updated) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      return null;
    }
    if (proposal.status !== "APPLYING" && proposal.status !== "APPLIED") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const rawSteps = await loadApplySteps(tx, proposal.id, true);
    if (proposal.status === "APPLIED") {
      const operation = await validateOperation(tx, proposal, rawSteps, actor.authUserId);
      return await validateAppliedReplay(tx, operation, actor.authUserId);
    }
    const boundActors = new Set(rawSteps.map((step) => step.apply_actor_auth_user_id));
    if (boundActors.size === 1 && rawSteps[0]?.apply_actor_auth_user_id !== actor.authUserId) {
      throw new ProposalApplyError("APPLY_ACTOR_MISMATCH", undefined, 403);
    }
    return null;
  });
}

async function markNextStepInFlight(
  proposalId: string,
  actorId: string
): Promise<{ operation: ValidatedOperation; step: PersistedApplyStep } | null> {
  const result = await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    if (proposal.status === "APPLIED") return { next: null, failure: null };
    if (proposal.status !== "APPLYING" || proposal.item_status !== "APPROVED") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const rawSteps = await loadApplySteps(tx, proposal.id, true);
    const boundActors = new Set(rawSteps.map((step) => step.apply_actor_auth_user_id));
    if (boundActors.size === 1 && rawSteps[0]?.apply_actor_auth_user_id !== actorId) {
      throw new ProposalApplyError("APPLY_ACTOR_MISMATCH", undefined, 403);
    }
    let operation: ValidatedOperation;
    try {
      operation = await validateOperation(tx, proposal, rawSteps, actorId);
    } catch (error) {
      const failure = classifyApplyFailure(error);
      const failedStep = rawSteps.find((step) => step.step_status !== "COMMITTED");
      if (
        failure.status === "FAILED_TERMINAL" &&
        boundActors.size === 1 &&
        rawSteps[0]?.apply_actor_auth_user_id === actorId &&
        failedStep &&
        failedStep.step_status !== "FAILED_TERMINAL"
      ) {
        await tx.execute(sql`
          UPDATE ai_proposal_apply_steps
          SET step_status = 'FAILED_TERMINAL', target_id = NULL,
              error_message = ${failure.message}, updated_at = NOW()
          WHERE proposal_id = ${proposal.id}::uuid AND step_key = ${failedStep.step_key}
        `);
      }
      return {
        next: null,
        failure: new ProposalApplyError(
          failure.status === "FAILED_TERMINAL"
            ? "AI_PROPOSAL_APPLY_FAILED_TERMINAL"
            : "AI_PROPOSAL_APPLY_FAILED_RETRYABLE",
          failure.message,
          failure.status === "FAILED_TERMINAL" ? 409 : 503
        ),
      };
    }
    const step = operation.steps.find((candidate) => candidate.stepStatus !== "COMMITTED");
    if (!step) return { next: null, failure: null };
    if (step.stepStatus === "FAILED_TERMINAL") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_FAILED_TERMINAL");
    }
    await tx.execute(sql`
      UPDATE ai_proposal_apply_steps
      SET step_status = 'IN_FLIGHT', error_message = NULL, updated_at = NOW()
      WHERE proposal_id = ${proposal.id}::uuid AND step_key = ${step.stepKey}
    `);
    return {
      next: {
        operation,
        step: { ...step, stepStatus: "IN_FLIGHT" as const, errorMessage: null },
      },
      failure: null,
    };
  });
  if (result.failure) throw result.failure;
  return result.next;
}

async function recordStepFailure(
  proposalId: string,
  stepKey: string,
  actorId: string,
  error: unknown
): Promise<never> {
  const failure = classifyApplyFailure(error);
  await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    if (proposal.status !== "APPLYING") return;
    const rawSteps = await loadApplySteps(tx, proposal.id, true);
    const step = rawSteps.find((candidate) => candidate.step_key === stepKey);
    if (!step || step.apply_actor_auth_user_id !== actorId) return;
    if (step.step_status === "COMMITTED" || step.step_status === "FAILED_TERMINAL") return;
    await tx.execute(sql`
      UPDATE ai_proposal_apply_steps
      SET step_status = ${failure.status}, target_id = NULL,
          error_message = ${failure.message}, updated_at = NOW()
      WHERE proposal_id = ${proposalId}::uuid AND step_key = ${stepKey}
    `);
  });
  throw new ProposalApplyError(
    failure.status === "FAILED_TERMINAL"
      ? "AI_PROPOSAL_APPLY_FAILED_TERMINAL"
      : "AI_PROPOSAL_APPLY_FAILED_RETRYABLE",
    failure.message,
    failure.status === "FAILED_TERMINAL" ? 409 : 503
  );
}

function recordFinalizationFailure(error: unknown): never {
  if (error instanceof ProposalApplyError && error.code === "APPLY_ACTOR_MISMATCH") throw error;
  const failure = classifyApplyFailure(error);
  throw new ProposalApplyError(
    failure.status === "FAILED_TERMINAL"
      ? "AI_PROPOSAL_APPLY_FAILED_TERMINAL"
      : "AI_PROPOSAL_APPLY_FAILED_RETRYABLE",
    failure.message,
    failure.status === "FAILED_TERMINAL" ? 409 : 503
  );
}

async function executeCatalogStep(
  operation: ValidatedOperation,
  step: PersistedApplyStep,
  actor: VerifiedAuthContextReady
): Promise<Product | ProductVariant> {
  const kind = parseApplyStepKey(step.stepKey);
  if (kind.kind === "PRODUCT_CREATE") {
    const payload = productCreateApplyPayloadSchema.parse(step.requestPayload);
    return await createProduct(
      { ...payload, mutationRequestId: step.mutationRequestId },
      { authContext: actor }
    );
  }
  if (kind.kind === "PRODUCT_UPDATE") {
    const payload =
      operation.projection.mode === "CREATE"
        ? createProductUpdateApplyPayloadSchema.parse(step.requestPayload)
        : enrichProductUpdateApplyPayloadSchema.parse(step.requestPayload);
    return await updateProduct(
      { ...payload, mutationRequestId: step.mutationRequestId },
      { authContext: actor, requiredProductStatus: "DRAFT" }
    );
  }
  const payload = variantCreateApplyPayloadSchema.parse(step.requestPayload);
  return await createVariant(
    { ...payload, mutationRequestId: step.mutationRequestId },
    { authContext: actor, requiredProductStatus: "DRAFT" }
  );
}

async function commitProductCreate(
  proposalId: string,
  operationId: string,
  actorId: string,
  result: Product
): Promise<void> {
  await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    if (proposal.status === "APPLIED") {
      const operation = await validateOperation(
        tx,
        proposal,
        await loadApplySteps(tx, proposal.id, true),
        actorId
      );
      const step = operation.steps.find((candidate) => candidate.stepKey === "PRODUCT_CREATE");
      if (!step || step.stepStatus !== "COMMITTED" || step.targetId !== result.id) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      return;
    }
    if (proposal.status !== "APPLYING" || proposal.item_status !== "APPROVED") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const projection = await deriveApprovedProposalApplyProjection(tx, proposal.id, "APPLYING");
    if (projection.mode !== "CREATE") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const rawSteps = await loadApplySteps(tx, proposal.id, true);
    const productStepRow = rawSteps.find((step) => step.step_key === "PRODUCT_CREATE");
    if (!productStepRow) throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    const productStep = validateStep("CREATE", productStepRow, operationId, actorId);
    if (productStep.stepStatus === "COMMITTED") {
      if (productStep.targetId !== result.id) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      await validateOperation(tx, proposal, rawSteps, actorId);
      return;
    }
    if (productStep.stepStatus === "FAILED_TERMINAL") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_FAILED_TERMINAL");
    }
    await tx.execute(sql`
      UPDATE ai_proposal_apply_steps
      SET step_status = 'COMMITTED', target_id = ${result.id}::uuid,
          error_message = NULL, updated_at = NOW()
      WHERE proposal_id = ${proposal.id}::uuid AND step_key = 'PRODUCT_CREATE'
    `);
    const downstream = buildCreateDownstreamStepDefinitions(
      operationId,
      projection,
      result.id,
      result.createdAt.toISOString(),
      await mergedPdpForProjection(tx, projection)
    );
    for (const definition of downstream) {
      await insertStep(tx, proposal.id, operationId, actorId, definition);
    }
    const completedSteps = await loadApplySteps(tx, proposal.id, true);
    await validateOperation(tx, proposal, completedSteps, actorId);
  });
}

async function commitCatalogStep(
  proposalId: string,
  operationId: string,
  actorId: string,
  stepKey: string,
  result: Product | ProductVariant
): Promise<void> {
  await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    if (proposal.status === "APPLIED") {
      const operation = await validateOperation(
        tx,
        proposal,
        await loadApplySteps(tx, proposal.id, true),
        actorId
      );
      const step = operation.steps.find((candidate) => candidate.stepKey === stepKey);
      if (!step || step.stepStatus !== "COMMITTED" || step.targetId !== result.id) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      return;
    }
    if (proposal.status !== "APPLYING" || proposal.item_status !== "APPROVED") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const operation = await validateOperation(
      tx,
      proposal,
      await loadApplySteps(tx, proposal.id, true),
      actorId
    );
    if (operation.applyOperationId !== operationId) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const step = operation.steps.find((candidate) => candidate.stepKey === stepKey);
    if (!step) throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    const kind = parseApplyStepKey(stepKey);
    if (kind.kind === "PRODUCT_CREATE") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const payload = parseApplyStepPayload(
      operation.projection.mode,
      step.stepKey,
      step.requestPayload
    );
    if (kind.kind === "PRODUCT_UPDATE") {
      const productPayload = payload as { productId: string };
      if (result.id !== productPayload.productId) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
    } else {
      const variantPayload = payload as VariantCreateApplyPayload;
      if (!("productId" in result) || result.productId !== variantPayload.productId) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
    }
    if (step.stepStatus === "COMMITTED") {
      if (step.targetId !== result.id) {
        throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
      }
      return;
    }
    if (step.stepStatus === "FAILED_TERMINAL") {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_FAILED_TERMINAL");
    }
    await tx.execute(sql`
      UPDATE ai_proposal_apply_steps
      SET step_status = 'COMMITTED', target_id = ${result.id}::uuid,
          error_message = NULL, updated_at = NOW()
      WHERE proposal_id = ${proposal.id}::uuid AND step_key = ${stepKey}
    `);
  });
}

async function assertCanonicalTargets(
  tx: Transaction,
  operation: ValidatedOperation
): Promise<{ canonicalProductId: string; variantsCreatedCount: number }> {
  const productCreateStep = operation.steps.find((step) => step.stepKey === "PRODUCT_CREATE");
  const canonicalProductId =
    operation.projection.mode === "CREATE"
      ? productCreateStep?.targetId
      : operation.projection.targetProductId;
  if (!canonicalProductId) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const [product] = rows<{ id: string }>(
    await tx.execute(sql`SELECT id FROM products WHERE id = ${canonicalProductId}::uuid LIMIT 1`)
  );
  if (!product) throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");

  for (const step of operation.steps) {
    if (step.stepStatus !== "COMMITTED" || !step.targetId) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const kind = parseApplyStepKey(step.stepKey);
    const action =
      kind.kind === "VARIANT_CREATE" ? "catalog:variant:create" : "catalog:product:update";
    const expectedAction = kind.kind === "PRODUCT_CREATE" ? "catalog:product:create" : action;
    const targetType = kind.kind === "VARIANT_CREATE" ? "product_variant" : "product";
    const catalogFingerprint =
      kind.kind === "PRODUCT_CREATE"
        ? computeRequestFingerprint({
            ...productCreateApplyPayloadSchema.parse(step.requestPayload),
            initialVariant: null,
          })
        : step.requestFingerprint;
    const mutationRequestDigest = computeMutationRequestDigest(
      operation.applyActorAuthUserId,
      expectedAction,
      step.mutationRequestId
    );
    const evidenceRows = rows<Record<string, unknown>>(
      await tx.execute(sql`
        SELECT actor_type, actor_id, action, target_type, target_id, metadata, request_id
        FROM audit_events
        WHERE actor_type = 'ADMIN'
          AND actor_id = ${operation.applyActorAuthUserId}
          AND action = ${expectedAction}
          AND metadata->>'mutation_request_digest' = ${mutationRequestDigest}
        ORDER BY timestamp, id
      `)
    );
    const evidence = evidenceRows[0];
    if (
      evidenceRows.length !== 1 ||
      !evidence ||
      evidence.actor_type !== "ADMIN" ||
      evidence.actor_id !== operation.applyActorAuthUserId ||
      evidence.action !== expectedAction ||
      evidence.target_type !== targetType ||
      evidence.target_id !== step.targetId ||
      evidence.request_id !== null ||
      !isPlainRecord(evidence.metadata) ||
      evidence.metadata.mutation_request_digest !== mutationRequestDigest ||
      evidence.metadata.request_fingerprint !== catalogFingerprint
    ) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
  }

  const updateStep = operation.steps.find((step) => step.stepKey === "PRODUCT_UPDATE");
  if (updateStep && updateStep.targetId !== canonicalProductId) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const variantSteps = operation.steps.filter((step) => step.stepKey.startsWith("VARIANT_CREATE:"));
  const variantIds = new Set<string>();
  for (const step of variantSteps) {
    if (!step.targetId || variantIds.has(step.targetId)) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    variantIds.add(step.targetId);
    const [variant] = rows<{ product_id: string }>(
      await tx.execute(sql`
        SELECT product_id FROM product_variants WHERE id = ${step.targetId}::uuid LIMIT 1
      `)
    );
    if (!variant || variant.product_id !== canonicalProductId) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
  }
  return { canonicalProductId, variantsCreatedCount: variantSteps.length };
}

async function validateAppliedReplay(
  tx: Transaction,
  operation: ValidatedOperation,
  actorId: string
): Promise<ProposalApplyResult> {
  if (
    operation.proposal.status !== "APPLIED" ||
    operation.proposal.item_status !== "APPLIED" ||
    operation.applyActorAuthUserId !== actorId ||
    operation.steps.some((step) => step.stepStatus !== "COMMITTED") ||
    !operation.proposal.applied_product_id ||
    !operation.proposal.applied_at
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const durable = await assertCanonicalTargets(tx, operation);
  if (operation.proposal.applied_product_id !== durable.canonicalProductId) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const auditRows = rows<Record<string, unknown>>(
    await tx.execute(sql`
      SELECT actor_type, actor_id, target_type, target_id, metadata, request_id
      FROM audit_events
      WHERE action = ${AI_AUDIT_ACTIONS.AI_PROPOSAL_APPLIED}
        AND target_id = ${operation.proposal.id}
      ORDER BY timestamp, id
    `)
  );
  const expectedMetadata = {
    proposalId: operation.proposal.id,
    canonicalProductId: durable.canonicalProductId,
    variantsCreatedCount: durable.variantsCreatedCount,
  };
  const audit = auditRows[0];
  if (
    auditRows.length !== 1 ||
    !audit ||
    audit.actor_type !== "ADMIN" ||
    audit.actor_id !== actorId ||
    audit.target_type !== "ai_product_proposal" ||
    audit.target_id !== operation.proposal.id ||
    audit.request_id !== null ||
    !jsonEqual(audit.metadata, expectedMetadata)
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  return {
    proposalId: operation.proposal.id,
    status: "APPLIED",
    canonicalProductId: durable.canonicalProductId,
    applyOperationId: operation.applyOperationId,
    replayed: true,
  };
}

async function finalizeApply(proposalId: string, actorId: string): Promise<ProposalApplyResult> {
  return await db.transaction(async (tx) => {
    const proposal = await loadApplyProposal(tx, proposalId, true);
    const operation = await validateOperation(
      tx,
      proposal,
      await loadApplySteps(tx, proposal.id, true),
      actorId
    );
    if (proposal.status === "APPLIED") {
      return await validateAppliedReplay(tx, operation, actorId);
    }
    if (
      proposal.status !== "APPLYING" ||
      proposal.item_status !== "APPROVED" ||
      operation.steps.some((step) => step.stepStatus !== "COMMITTED")
    ) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const durable = await assertCanonicalTargets(tx, operation);
    const priorAudit = rows<{ count: number }>(
      await tx.execute(sql`
        SELECT count(*)::int AS count FROM audit_events
        WHERE action = ${AI_AUDIT_ACTIONS.AI_PROPOSAL_APPLIED}
          AND target_id = ${proposal.id}
      `)
    )[0]?.count;
    if (priorAudit !== 0) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const appliedAt = new Date().toISOString();
    const [appliedProposal] = rows<{ id: string }>(
      await tx.execute(sql`
      UPDATE ai_product_proposals
      SET status = 'APPLIED', applied_product_id = ${durable.canonicalProductId}::uuid,
          applied_at = ${appliedAt},
          updated_at = GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            date_trunc('milliseconds', updated_at) + interval '1 millisecond'
      )
      WHERE id = ${proposal.id}::uuid AND status = 'APPLYING'
      RETURNING id
    `)
    );
    if (!appliedProposal) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const [appliedItem] = rows<{ id: string }>(
      await tx.execute(sql`
      UPDATE ai_research_job_items
      SET status = 'APPLIED',
          updated_at = GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            date_trunc('milliseconds', updated_at) + interval '1 millisecond'
      )
      WHERE id = ${proposal.job_item_id}::uuid AND status = 'APPROVED'
      RETURNING id
    `)
    );
    if (!appliedItem) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
    const metadata = {
      proposalId: proposal.id,
      canonicalProductId: durable.canonicalProductId,
      variantsCreatedCount: durable.variantsCreatedCount,
    };
    await tx.execute(sql`
      INSERT INTO audit_events (
        id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
      ) VALUES (
        ${generateUuidV7()}::uuid, ${appliedAt}, 'ADMIN', ${actorId},
        ${AI_AUDIT_ACTIONS.AI_PROPOSAL_APPLIED}, 'ai_product_proposal', ${proposal.id},
        ${JSON.stringify(metadata)}::jsonb, NULL
      )
    `);
    return {
      proposalId: proposal.id,
      status: "APPLIED",
      canonicalProductId: durable.canonicalProductId,
      applyOperationId: operation.applyOperationId,
      replayed: false,
    };
  });
}

export async function applyProposal(
  rawInput: { proposalId: string },
  options?: ProposalApplyServiceOptions
): Promise<ProposalApplyResult> {
  const actor = await resolveApplyActor(options);
  const input = proposalApplyInputSchema.parse(rawInput);
  let replay: ProposalApplyResult | null;
  try {
    replay = await initializeOrLoadApply(input.proposalId, actor);
  } catch (error) {
    if (error instanceof ProposalApplyError || error instanceof ForbiddenError) throw error;
    const failure = classifyApplyFailure(error);
    throw new ProposalApplyError(
      failure.status === "FAILED_TERMINAL"
        ? "AI_PROPOSAL_APPLY_FAILED_TERMINAL"
        : "AI_PROPOSAL_APPLY_FAILED_RETRYABLE",
      failure.message,
      failure.status === "FAILED_TERMINAL" ? 409 : 503
    );
  }
  if (replay) return replay;

  for (let attempt = 0; attempt < 103; attempt += 1) {
    const next = await markNextStepInFlight(input.proposalId, actor.authUserId);
    if (!next) {
      try {
        return await finalizeApply(input.proposalId, actor.authUserId);
      } catch (error) {
        return recordFinalizationFailure(error);
      }
    }
    try {
      const result = await executeCatalogStep(next.operation, next.step, actor);
      if (next.step.stepKey === "PRODUCT_CREATE") {
        await commitProductCreate(
          input.proposalId,
          next.operation.applyOperationId,
          actor.authUserId,
          result as Product
        );
      } else {
        await commitCatalogStep(
          input.proposalId,
          next.operation.applyOperationId,
          actor.authUserId,
          next.step.stepKey,
          result
        );
      }
    } catch (error) {
      return await recordStepFailure(input.proposalId, next.step.stepKey, actor.authUserId, error);
    }
  }
  throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
}

function mapStepDto(step: PersistedApplyStep): ProposalApplyStepDto {
  return {
    stepKey: step.stepKey,
    stepOrdinal: step.stepOrdinal,
    stepStatus: step.stepStatus,
    targetId: step.targetId,
    errorMessage: step.errorMessage,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

export async function getProposalApplyStatus(
  rawProposalId: string,
  options?: ProposalApplyServiceOptions
): Promise<ProposalApplyStatusDto> {
  await resolveApplyActor(options);
  const { proposalId } = proposalApplyInputSchema.parse({ proposalId: rawProposalId });
  const proposal = await loadApplyProposal(db, proposalId);
  if (
    !["APPROVED", "APPLYING", "APPLIED"].includes(proposal.status) ||
    (proposal.item_mode !== "CREATE" && proposal.item_mode !== "ENRICH")
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_NOT_APPLICABLE");
  }
  const rawSteps = await loadApplySteps(db, proposal.id);
  const operationIds = new Set(rawSteps.map((step) => step.apply_operation_id));
  const actorIds = new Set(rawSteps.map((step) => step.apply_actor_auth_user_id));
  if (proposal.status === "APPROVED") {
    if (
      proposal.item_status !== "APPROVED" ||
      proposal.applied_product_id !== null ||
      proposal.applied_at !== null ||
      rawSteps.length !== 0
    ) {
      throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    }
  } else if (
    operationIds.size !== 1 ||
    actorIds.size !== 1 ||
    rawSteps.length === 0 ||
    (proposal.status === "APPLYING" &&
      (proposal.item_status !== "APPROVED" ||
        proposal.applied_product_id !== null ||
        proposal.applied_at !== null)) ||
    (proposal.status === "APPLIED" &&
      (proposal.item_status !== "APPLIED" ||
        proposal.applied_product_id === null ||
        proposal.applied_at === null))
  ) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  const operationId = rawSteps[0]?.apply_operation_id;
  const actorId = rawSteps[0]?.apply_actor_auth_user_id;
  const mode: ProposalApplyMode = proposal.item_mode === "CREATE" ? "CREATE" : "ENRICH";
  const steps =
    operationId && actorId
      ? rawSteps.map((step) => validateStep(mode, step, operationId, actorId))
      : [];
  if (proposal.status === "APPLIED" && steps.some((step) => step.stepStatus !== "COMMITTED")) {
    throw new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
  }
  return {
    proposalId: proposal.id,
    proposalStatus: proposal.status as "APPROVED" | "APPLYING" | "APPLIED",
    itemStatus: proposal.item_status as "APPROVED" | "APPLIED",
    mode,
    canonicalProductId: proposal.applied_product_id,
    applyOperationId: operationId ?? null,
    steps: steps.map(mapStepDto),
  };
}
