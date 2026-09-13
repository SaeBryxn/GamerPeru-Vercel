import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { requirePermission, ForbiddenError } from "@/lib/auth/rbac";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  resolveAuthoritativeCategorySpecificationSchema,
  validateProductSpecificationValues,
} from "@/lib/admin/catalog/specifications";
import { isPlainRecord } from "@/lib/admin/catalog/record";
import { AI_AUDIT_ACTIONS } from "../audit-actions";
import {
  classifyProposalFieldPath,
  computeProposalReviewCounts,
  isCanonicalVariantPlan,
  isSameTerminalDecision,
  normalizeHumanVariantPlan,
  normalizeOptionalCopy,
  normalizeProposalName,
  normalizeProposalSlug,
  proposalFieldDecisionInputSchema,
  proposalReadInputSchema,
  proposalVersionInputSchema,
  validateSourceResolutionSemantics,
  humanVariantPlanInputSchema,
  type HumanVariantPlanInput,
  type ProposalFieldDecisionInput,
  type ProposalVersionInput,
} from "./schemas";
import {
  ProposalReviewError,
  type ApprovedProposalApplyProjection,
  type ProposalFieldReviewDto,
  type ProposalMutationResult,
  type ProposalReviewDecision,
  type ProposalReviewDetailDto,
  type ProposalReviewServiceOptions,
} from "./types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

interface ProposalRow {
  id: string;
  job_item_id: string;
  brand_id: string | null;
  category_id: string | null;
  proposed_name: string;
  proposed_slug: string;
  proposed_subtitle: string | null;
  proposed_description: string | null;
  proposed_specifications: unknown;
  unmapped_specifications: unknown;
  proposed_variants: unknown;
  proposed_seo_draft: unknown;
  media_candidates: unknown;
  status: string;
  applied_product_id: string | null;
  reviewed_by_auth_user_id: string | null;
  reviewed_at: Date | string | null;
  applied_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  input_query: string;
  item_mode: string;
  item_status: string;
  identity_status: string;
  target_product_id: string | null;
  target_product_version_snapshot: Date | string | null;
  selected_brand_name: string | null;
  selected_brand_status: string | null;
  selected_category_name: string | null;
  selected_category_status: string | null;
}

interface ReviewRow {
  id: string;
  proposal_id: string;
  field_path: string;
  proposed_value: unknown;
  selected_value: unknown;
  decision: string;
  verification_state: string;
  preferred_source_id: string | null;
  conflict_details: unknown;
  reviewed_by_auth_user_id: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  proposed_is_json_null?: boolean;
}

interface FieldSourceRow {
  id: string;
  field_review_id: string;
  source_id: string;
  relationship: string;
  source_value: unknown;
  source_job_item_id: string;
}

const CATALOG_FIELD_PATHS = ["catalog.brandId", "catalog.categoryId", "catalog.slug"] as const;
const ITEM_REVIEWABLE_STATES = new Set(["READY_FOR_REVIEW", "SOURCE_CONFLICT"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXTUAL_FIELDS = new Set([
  "copy.name",
  "copy.subtitle",
  "copy.description",
  "seo.title",
  "seo.description",
  "research.unmappedSpecifications",
  "research.variants",
  "research.mediaCandidates",
  ...CATALOG_FIELD_PATHS,
]);

function rows<T>(result: unknown): T[] {
  return result as T[];
}

function toIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => jsonEqual(item, right[index]))
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      jsonEqual(leftKeys, rightKeys) && leftKeys.every((key) => jsonEqual(left[key], right[key]))
    );
  }
  return false;
}

function normalizeJson(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("not JSON");
    const parsed: unknown = JSON.parse(serialized);
    const hasNonFinite = (candidate: unknown): boolean => {
      if (typeof candidate === "number") return !Number.isFinite(candidate);
      if (Array.isArray(candidate)) return candidate.some(hasNonFinite);
      if (isPlainRecord(candidate)) return Object.values(candidate).some(hasNonFinite);
      return false;
    };
    if (hasNonFinite(value)) throw new Error("non-finite number");
    return parsed;
  } catch {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  }
}

function assertVersion(proposal: ProposalRow, expected: string): void {
  if (asDate(proposal.updated_at).getTime() !== new Date(expected).getTime()) {
    throw new ProposalReviewError("AI_PROPOSAL_STALE", undefined, 409);
  }
}

async function resolveActor(
  options?: ProposalReviewServiceOptions
): Promise<VerifiedAuthContextReady> {
  const actor = options?.authContext ?? (await requirePermission("catalog:ai_research"));
  if (!actor.permissions.has("catalog:ai_research")) {
    throw new ForbiddenError("Missing catalog:ai_research permission.");
  }
  return actor;
}

async function loadProposal(
  executor: Executor,
  proposalId: string,
  lock = false
): Promise<ProposalRow> {
  const result = await executor.execute(sql`
    SELECT
      proposal.*,
      item.input_query,
      item.mode AS item_mode,
      item.status AS item_status,
      item.identity_status,
      item.target_product_id,
      item.target_product_version_snapshot,
      brand.name AS selected_brand_name,
      brand.status AS selected_brand_status,
      category.name AS selected_category_name,
      category.status AS selected_category_status
    FROM ai_product_proposals proposal
    JOIN ai_research_job_items item ON item.id = proposal.job_item_id
    LEFT JOIN brands brand ON brand.id = proposal.brand_id
    LEFT JOIN categories category ON category.id = proposal.category_id
    WHERE proposal.id = ${proposalId}::uuid
    ${lock ? sql`FOR UPDATE OF proposal` : sql``}
    LIMIT 1
  `);
  const proposal = rows<ProposalRow>(result)[0];
  if (!proposal) {
    throw new ProposalReviewError("AI_PROPOSAL_NOT_FOUND", undefined, 404);
  }
  return proposal;
}

async function loadReviews(
  executor: Executor,
  proposalId: string,
  lock = false
): Promise<ReviewRow[]> {
  return rows<ReviewRow>(
    await executor.execute(sql`
      SELECT review.*,
        jsonb_typeof(review.proposed_value) = 'null' AS proposed_is_json_null
      FROM ai_proposal_field_reviews review
      WHERE review.proposal_id = ${proposalId}::uuid
      ORDER BY review.field_path, review.id
      ${lock ? sql`FOR UPDATE` : sql``}
    `)
  );
}

function reviewMap(reviews: ReviewRow[]): Map<string, ReviewRow> {
  const mapped = new Map<string, ReviewRow>();
  for (const review of reviews) {
    if (mapped.has(review.field_path)) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    mapped.set(review.field_path, review);
  }
  return mapped;
}

function assertReviewMetadata(row: ReviewRow): void {
  const decision = row.decision as ProposalReviewDecision;
  if (!["PENDING", "ACCEPTED", "REJECTED", "MANUALLY_EDITED"].includes(decision)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (decision === "PENDING") {
    if (
      row.selected_value !== null ||
      row.preferred_source_id !== null ||
      row.reviewed_by_auth_user_id !== null ||
      row.reviewed_at !== null
    ) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    return;
  }
  if (!row.reviewed_by_auth_user_id || !row.reviewed_at) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (decision === "REJECTED") {
    if (row.selected_value !== null || row.preferred_source_id !== null) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    return;
  }
  if (decision === "ACCEPTED" && !jsonEqual(row.selected_value, row.proposed_value)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (decision === "MANUALLY_EDITED" && row.selected_value === undefined) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
}

function effectiveCatalogId(row: ReviewRow): string | null {
  if (row.decision === "PENDING" || row.decision === "REJECTED") return null;
  if (
    row.decision !== "MANUALLY_EDITED" ||
    typeof row.selected_value !== "string" ||
    !UUID_PATTERN.test(row.selected_value)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  return row.selected_value;
}

function assertCatalogLedger(proposal: ProposalRow, reviews: ReviewRow[]): Map<string, ReviewRow> {
  const mapped = reviewMap(reviews);
  const catalogRows = CATALOG_FIELD_PATHS.map((path) => mapped.get(path)).filter(Boolean);
  if (catalogRows.length !== CATALOG_FIELD_PATHS.length) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  const brand = mapped.get("catalog.brandId")!;
  const category = mapped.get("catalog.categoryId")!;
  const slug = mapped.get("catalog.slug")!;
  if (
    brand.proposed_is_json_null !== true ||
    category.proposed_is_json_null !== true ||
    brand.verification_state !== "UNVERIFIED" ||
    category.verification_state !== "UNVERIFIED" ||
    slug.verification_state !== "AI_INFERRED" ||
    brand.preferred_source_id !== null ||
    category.preferred_source_id !== null ||
    slug.preferred_source_id !== null ||
    brand.conflict_details !== null ||
    category.conflict_details !== null ||
    slug.conflict_details !== null ||
    typeof slug.proposed_value !== "string" ||
    slug.proposed_value !== proposal.proposed_slug
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  for (const row of [brand, category, slug]) assertReviewMetadata(row);
  if (brand.decision === "ACCEPTED" || category.decision === "ACCEPTED") {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (
    slug.decision === "MANUALLY_EDITED" &&
    (typeof slug.selected_value !== "string" ||
      normalizeProposalSlug(slug.selected_value) !== slug.selected_value)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (
    proposal.brand_id !== effectiveCatalogId(brand) ||
    proposal.category_id !== effectiveCatalogId(category)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  return mapped;
}

function assertOptionalCatalogLedger(
  proposal: ProposalRow,
  reviews: ReviewRow[]
): Map<string, ReviewRow> {
  const count = reviews.filter((review) =>
    CATALOG_FIELD_PATHS.includes(review.field_path as (typeof CATALOG_FIELD_PATHS)[number])
  ).length;
  if (count === 0) {
    if (proposal.brand_id !== null || proposal.category_id !== null) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    return reviewMap(reviews);
  }
  return assertCatalogLedger(proposal, reviews);
}

function assertCopyNameMirror(proposal: ProposalRow, reviews: ReviewRow[]): void {
  const name = reviewMap(reviews).get("copy.name");
  if (!name || !jsonEqual(name.proposed_value, proposal.proposed_name)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
}

async function bumpProposalVersion(tx: Transaction, proposalId: string): Promise<string> {
  const [updated] = rows<{ updated_at: Date | string }>(
    await tx.execute(sql`
      UPDATE ai_product_proposals
      SET updated_at = GREATEST(
        date_trunc('milliseconds', clock_timestamp()),
        date_trunc('milliseconds', updated_at) + interval '1 millisecond'
      )
      WHERE id = ${proposalId}::uuid
      RETURNING updated_at
    `)
  );
  if (!updated) throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  return asDate(updated.updated_at).toISOString();
}

async function lockAndRefreshItem(tx: Transaction, proposal: ProposalRow): Promise<void> {
  const [item] = rows<{
    mode: string;
    status: string;
    identity_status: string;
    target_product_id: string | null;
    target_product_version_snapshot: Date | string | null;
  }>(
    await tx.execute(sql`
      SELECT mode, status, identity_status, target_product_id, target_product_version_snapshot
      FROM ai_research_job_items
      WHERE id = ${proposal.job_item_id}::uuid
      FOR UPDATE
    `)
  );
  if (!item) throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  proposal.item_mode = item.mode;
  proposal.item_status = item.status;
  proposal.identity_status = item.identity_status;
  proposal.target_product_id = item.target_product_id;
  proposal.target_product_version_snapshot = item.target_product_version_snapshot;
}

export async function getProposalReviewDetail(
  rawProposalId: string,
  options?: ProposalReviewServiceOptions
): Promise<ProposalReviewDetailDto> {
  await resolveActor(options);
  const proposalId = proposalReadInputSchema.parse({ proposalId: rawProposalId }).proposalId;
  const proposal = await loadProposal(db, proposalId);
  const reviews = await loadReviews(db, proposalId);
  const fieldSources = rows<FieldSourceRow>(
    await db.execute(sql`
      SELECT link.*, source.job_item_id AS source_job_item_id
      FROM ai_proposal_field_sources link
      JOIN ai_sources source ON source.id = link.source_id
      JOIN ai_proposal_field_reviews review ON review.id = link.field_review_id
      WHERE review.proposal_id = ${proposalId}::uuid
      ORDER BY link.field_review_id, link.relationship, link.source_id
    `)
  );
  const sourceRows = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT DISTINCT source.*
      FROM ai_sources source
      JOIN ai_proposal_field_sources link ON link.source_id = source.id
      JOIN ai_proposal_field_reviews review ON review.id = link.field_review_id
      WHERE review.proposal_id = ${proposalId}::uuid
      ORDER BY source.id
    `)
  );
  if (fieldSources.some((source) => source.source_job_item_id !== proposal.job_item_id)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  const fields: ProposalFieldReviewDto[] = reviews.map((review) => ({
    id: review.id,
    fieldPath: review.field_path,
    proposedValue: review.proposed_value,
    selectedValue: review.selected_value,
    decision: review.decision as ProposalReviewDecision,
    verificationState: review.verification_state as ProposalFieldReviewDto["verificationState"],
    preferredSourceId: review.preferred_source_id,
    conflictDetails: review.conflict_details,
    reviewedByAuthUserId: review.reviewed_by_auth_user_id,
    reviewedAt: toIso(review.reviewed_at),
    createdAt: toIso(review.created_at)!,
    updatedAt: toIso(review.updated_at)!,
    sources: fieldSources
      .filter((source) => source.field_review_id === review.id)
      .map((source) => ({
        id: source.id,
        sourceId: source.source_id,
        relationship: source.relationship as "SUPPORTS" | "CONFLICTS" | "CONTEXT_ONLY",
        sourceValue: source.source_value,
      })),
  }));

  return {
    proposal: {
      id: proposal.id,
      status: proposal.status as ProposalReviewDetailDto["proposal"]["status"],
      brandId: proposal.brand_id,
      categoryId: proposal.category_id,
      proposedName: proposal.proposed_name,
      proposedSlug: proposal.proposed_slug,
      proposedSubtitle: proposal.proposed_subtitle,
      proposedDescription: proposal.proposed_description,
      proposedSpecifications: proposal.proposed_specifications,
      unmappedSpecifications: proposal.unmapped_specifications,
      proposedVariants: proposal.proposed_variants,
      proposedSeoDraft: proposal.proposed_seo_draft,
      mediaCandidates: proposal.media_candidates,
      appliedProductId: proposal.applied_product_id,
      reviewedByAuthUserId: proposal.reviewed_by_auth_user_id,
      reviewedAt: toIso(proposal.reviewed_at),
      createdAt: toIso(proposal.created_at)!,
      updatedAt: toIso(proposal.updated_at)!,
    },
    item: {
      id: proposal.job_item_id,
      query: proposal.input_query,
      mode: proposal.item_mode as "CREATE" | "ENRICH",
      status: proposal.item_status,
      identityStatus: proposal.identity_status,
      targetProductId: proposal.target_product_id,
      targetProductVersionSnapshot: toIso(proposal.target_product_version_snapshot),
    },
    catalogSelections: {
      brand:
        proposal.brand_id && proposal.selected_brand_name && proposal.selected_brand_status
          ? {
              id: proposal.brand_id,
              name: proposal.selected_brand_name,
              status: proposal.selected_brand_status,
            }
          : null,
      category:
        proposal.category_id && proposal.selected_category_name && proposal.selected_category_status
          ? {
              id: proposal.category_id,
              name: proposal.selected_category_name,
              status: proposal.selected_category_status,
            }
          : null,
    },
    fields,
    sources: sourceRows.map((source) => ({
      id: String(source.id),
      originalUrl: source.original_url === null ? null : String(source.original_url),
      resolvedUrl: source.resolved_url === null ? null : String(source.resolved_url),
      providerCitationId:
        source.provider_citation_id === null ? null : String(source.provider_citation_id),
      sourceName: String(source.source_name),
      retrievalMethod: String(source.retrieval_method),
      trustTier: String(source.trust_tier),
      trustBasis: String(source.trust_basis),
      fetchedAt: toIso(source.fetched_at as Date | string)!,
      fetchStatus: String(source.fetch_status),
      snippet: source.snippet === null ? null : String(source.snippet),
    })),
  };
}

export async function initializeCatalogSelectionReviews(
  rawInput: ProposalVersionInput,
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  await resolveActor(options);
  const input = proposalVersionInputSchema.parse(rawInput);
  return await db.transaction(async (tx) => {
    const proposal = await loadProposal(tx, input.proposalId, true);
    await lockAndRefreshItem(tx, proposal);
    if (proposal.status !== "DRAFT") {
      throw new ProposalReviewError("AI_PROPOSAL_NOT_DRAFT", undefined, 409);
    }
    if (!ITEM_REVIEWABLE_STATES.has(proposal.item_status)) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE", undefined, 409);
    }
    if (normalizeProposalSlug(proposal.proposed_slug) !== proposal.proposed_slug) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_SLUG");
    }
    const reviews = await loadReviews(tx, input.proposalId, true);
    assertCopyNameMirror(proposal, reviews);
    const existingCatalogRows = reviews.filter((review) =>
      CATALOG_FIELD_PATHS.includes(review.field_path as (typeof CATALOG_FIELD_PATHS)[number])
    );
    if (existingCatalogRows.length === CATALOG_FIELD_PATHS.length) {
      assertCatalogLedger(proposal, reviews);
      return {
        proposalId: proposal.id,
        status: "DRAFT",
        proposalUpdatedAt: asDate(proposal.updated_at).toISOString(),
        replayed: true,
      };
    }
    if (existingCatalogRows.length !== 0) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    if (proposal.brand_id !== null || proposal.category_id !== null) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    assertVersion(proposal, input.expectedProposalUpdatedAt);
    const now = new Date().toISOString();
    for (const field of CATALOG_FIELD_PATHS) {
      const id = generateUuidV7();
      if (field === "catalog.slug") {
        await tx.execute(sql`
          INSERT INTO ai_proposal_field_reviews (
            id, proposal_id, field_path, proposed_value, selected_value, decision,
            verification_state, preferred_source_id, conflict_details,
            reviewed_by_auth_user_id, reviewed_at, created_at, updated_at
          ) VALUES (
            ${id}::uuid, ${proposal.id}::uuid, ${field}, ${JSON.stringify(proposal.proposed_slug)}::jsonb,
            NULL, 'PENDING', 'AI_INFERRED', NULL, NULL, NULL, NULL, ${now}, ${now}
          )
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO ai_proposal_field_reviews (
            id, proposal_id, field_path, proposed_value, selected_value, decision,
            verification_state, preferred_source_id, conflict_details,
            reviewed_by_auth_user_id, reviewed_at, created_at, updated_at
          ) VALUES (
            ${id}::uuid, ${proposal.id}::uuid, ${field}, 'null'::jsonb,
            NULL, 'PENDING', 'UNVERIFIED', NULL, NULL, NULL, NULL, ${now}, ${now}
          )
        `);
      }
    }
    const updatedAt = await bumpProposalVersion(tx, proposal.id);
    return {
      proposalId: proposal.id,
      status: "DRAFT",
      proposalUpdatedAt: updatedAt,
      replayed: false,
    };
  });
}

function normalizeSelectedValue(row: ReviewRow, input: ProposalFieldDecisionInput): unknown {
  if (input.decision === "PENDING" || input.decision === "REJECTED") {
    if (input.preferredSourceId) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
    }
    return null;
  }
  if (input.decision === "ACCEPTED") {
    if (row.field_path === "catalog.brandId" || row.field_path === "catalog.categoryId") {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
    }
    if (row.field_path === "research.variants") {
      throw new ProposalReviewError("AI_PROPOSAL_HUMAN_PRICE_REQUIRED");
    }
    return row.proposed_value;
  }
  if (input.selectedValue === undefined) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  }
  if (row.field_path === "research.variants") {
    throw new ProposalReviewError("AI_PROPOSAL_HUMAN_PRICE_REQUIRED");
  }
  if (row.field_path === "catalog.brandId" || row.field_path === "catalog.categoryId") {
    if (typeof input.selectedValue !== "string" || !UUID_PATTERN.test(input.selectedValue)) {
      throw new ProposalReviewError(
        row.field_path === "catalog.brandId"
          ? "AI_PROPOSAL_INVALID_BRAND"
          : "AI_PROPOSAL_INVALID_CATEGORY"
      );
    }
    return input.selectedValue;
  }
  if (row.field_path === "catalog.slug") return normalizeProposalSlug(input.selectedValue);
  if (row.field_path === "copy.name") return normalizeProposalName(input.selectedValue);
  if (row.field_path === "copy.subtitle") return normalizeOptionalCopy(input.selectedValue, 255);
  if (row.field_path === "copy.description")
    return normalizeOptionalCopy(input.selectedValue, 8_000);
  if (row.field_path === "seo.title") return normalizeOptionalCopy(input.selectedValue, 70);
  if (row.field_path === "seo.description") return normalizeOptionalCopy(input.selectedValue, 170);
  return normalizeJson(input.selectedValue);
}

function isExactReviewReplay(
  row: ReviewRow,
  decision: ProposalReviewDecision,
  selectedValue: unknown,
  preferredSourceId: string | null,
  actorId: string
): boolean {
  if (
    row.decision !== decision ||
    !jsonEqual(row.selected_value, selectedValue) ||
    row.preferred_source_id !== preferredSourceId
  ) {
    return false;
  }
  return (
    decision !== "PENDING" && row.reviewed_by_auth_user_id === actorId && row.reviewed_at !== null
  );
}

async function validatePreferredSource(
  tx: Transaction,
  proposal: ProposalRow,
  row: ReviewRow,
  decision: ProposalReviewDecision,
  selectedValue: unknown,
  preferredSourceId: string | null
): Promise<void> {
  if (!preferredSourceId) {
    validateSourceResolutionSemantics({
      decision,
      verificationState: row.verification_state,
      selectedValue,
      preferredSource: null,
    });
    return;
  }
  const [ownedSource] = rows<{ job_item_id: string }>(
    await tx.execute(sql`
      SELECT job_item_id FROM ai_sources WHERE id = ${preferredSourceId}::uuid LIMIT 1
    `)
  );
  if (!ownedSource) throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
  if (ownedSource.job_item_id !== proposal.job_item_id) {
    throw new ProposalReviewError("AI_PROPOSAL_CROSS_ITEM_SOURCE");
  }
  const [source] = rows<FieldSourceRow>(
    await tx.execute(sql`
      SELECT link.*, ${proposal.job_item_id} AS source_job_item_id
      FROM ai_proposal_field_sources link
      WHERE link.field_review_id = ${row.id}::uuid
        AND link.source_id = ${preferredSourceId}::uuid
      LIMIT 1
    `)
  );
  if (!source) throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
  validateSourceResolutionSemantics({
    decision,
    verificationState: row.verification_state,
    selectedValue,
    preferredSource: { relationship: source.relationship, sourceValue: source.source_value },
  });
}

async function validatePublishedCatalogSelection(
  tx: Transaction,
  fieldPath: string,
  selectedValue: unknown
): Promise<void> {
  if (fieldPath !== "catalog.brandId" && fieldPath !== "catalog.categoryId") return;
  const table = fieldPath === "catalog.brandId" ? sql`brands` : sql`categories`;
  const [record] = rows<{ status: string }>(
    await tx.execute(
      sql`SELECT status FROM ${table} WHERE id = ${String(selectedValue)}::uuid LIMIT 1`
    )
  );
  if (!record || record.status !== "PUBLISHED") {
    throw new ProposalReviewError(
      fieldPath === "catalog.brandId" ? "AI_PROPOSAL_INVALID_BRAND" : "AI_PROPOSAL_INVALID_CATEGORY"
    );
  }
}

export async function reviewProposalField(
  rawInput: ProposalFieldDecisionInput,
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  const actor = await resolveActor(options);
  const parsed = proposalFieldDecisionInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  const input = parsed.data;
  return await db.transaction(async (tx) => {
    const proposal = await loadProposal(tx, input.proposalId, true);
    await lockAndRefreshItem(tx, proposal);
    if (proposal.status !== "DRAFT") {
      throw new ProposalReviewError("AI_PROPOSAL_NOT_DRAFT", undefined, 409);
    }
    if (!ITEM_REVIEWABLE_STATES.has(proposal.item_status)) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE", undefined, 409);
    }
    const reviews = await loadReviews(tx, proposal.id, true);
    assertOptionalCatalogLedger(proposal, reviews);
    assertCopyNameMirror(proposal, reviews);
    const row = reviewMap(reviews).get(input.fieldPath);
    if (!row) throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    const selectedValue = normalizeSelectedValue(row, input);
    const preferredSourceId = input.preferredSourceId ?? null;
    if (
      isExactReviewReplay(row, input.decision, selectedValue, preferredSourceId, actor.authUserId)
    ) {
      return {
        proposalId: proposal.id,
        status: "DRAFT",
        proposalUpdatedAt: asDate(proposal.updated_at).toISOString(),
        replayed: true,
      };
    }
    assertVersion(proposal, input.expectedProposalUpdatedAt);
    await validatePreferredSource(
      tx,
      proposal,
      row,
      input.decision,
      selectedValue,
      preferredSourceId
    );
    if (input.decision === "MANUALLY_EDITED") {
      await validatePublishedCatalogSelection(tx, row.field_path, selectedValue);
    }
    const isPending = input.decision === "PENDING";
    const selectedJson = selectedValue === null ? null : JSON.stringify(selectedValue);
    await tx.execute(sql`
      UPDATE ai_proposal_field_reviews
      SET selected_value = ${selectedJson}::jsonb,
          decision = ${input.decision},
          preferred_source_id = ${preferredSourceId}::uuid,
          reviewed_by_auth_user_id = ${isPending ? null : actor.authUserId}::uuid,
          reviewed_at = ${isPending ? null : new Date().toISOString()},
          updated_at = GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            date_trunc('milliseconds', updated_at) + interval '1 millisecond'
          )
      WHERE id = ${row.id}::uuid
    `);
    if (row.field_path === "catalog.brandId") {
      await tx.execute(sql`
        UPDATE ai_product_proposals SET brand_id = ${selectedValue === null ? null : String(selectedValue)}::uuid
        WHERE id = ${proposal.id}::uuid
      `);
    } else if (row.field_path === "catalog.categoryId") {
      await tx.execute(sql`
        UPDATE ai_product_proposals SET category_id = ${selectedValue === null ? null : String(selectedValue)}::uuid
        WHERE id = ${proposal.id}::uuid
      `);
    }
    const updatedAt = await bumpProposalVersion(tx, proposal.id);
    return {
      proposalId: proposal.id,
      status: "DRAFT",
      proposalUpdatedAt: updatedAt,
      replayed: false,
    };
  });
}

export async function setHumanVariantPlan(
  rawInput: HumanVariantPlanInput,
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  const actor = await resolveActor(options);
  const parsed = humanVariantPlanInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
  const input = parsed.data;
  const plan = normalizeHumanVariantPlan(input.variants);
  return await db.transaction(async (tx) => {
    const proposal = await loadProposal(tx, input.proposalId, true);
    await lockAndRefreshItem(tx, proposal);
    if (proposal.status !== "DRAFT") {
      throw new ProposalReviewError("AI_PROPOSAL_NOT_DRAFT", undefined, 409);
    }
    if (!ITEM_REVIEWABLE_STATES.has(proposal.item_status)) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE", undefined, 409);
    }
    const reviews = await loadReviews(tx, proposal.id, true);
    assertOptionalCatalogLedger(proposal, reviews);
    assertCopyNameMirror(proposal, reviews);
    const row = reviewMap(reviews).get("research.variants");
    if (!row) throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
    if (isExactReviewReplay(row, "MANUALLY_EDITED", plan, null, actor.authUserId)) {
      return {
        proposalId: proposal.id,
        status: "DRAFT",
        proposalUpdatedAt: asDate(proposal.updated_at).toISOString(),
        replayed: true,
      };
    }
    assertVersion(proposal, input.expectedProposalUpdatedAt);
    await tx.execute(sql`
      UPDATE ai_proposal_field_reviews
      SET selected_value = ${JSON.stringify(plan)}::jsonb,
          decision = 'MANUALLY_EDITED',
          preferred_source_id = NULL,
          reviewed_by_auth_user_id = ${actor.authUserId}::uuid,
          reviewed_at = ${new Date().toISOString()},
          updated_at = GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            date_trunc('milliseconds', updated_at) + interval '1 millisecond'
          )
      WHERE id = ${row.id}::uuid
    `);
    const updatedAt = await bumpProposalVersion(tx, proposal.id);
    return {
      proposalId: proposal.id,
      status: "DRAFT",
      proposalUpdatedAt: updatedAt,
      replayed: false,
    };
  });
}

async function loadFieldSources(tx: Transaction, proposal: ProposalRow): Promise<FieldSourceRow[]> {
  const sources = rows<FieldSourceRow>(
    await tx.execute(sql`
      SELECT link.*, source.job_item_id AS source_job_item_id
      FROM ai_proposal_field_sources link
      JOIN ai_sources source ON source.id = link.source_id
      JOIN ai_proposal_field_reviews review ON review.id = link.field_review_id
      WHERE review.proposal_id = ${proposal.id}::uuid
      ORDER BY link.field_review_id, link.relationship, link.source_id
    `)
  );
  if (sources.some((source) => source.source_job_item_id !== proposal.job_item_id)) {
    throw new ProposalReviewError("AI_PROPOSAL_CROSS_ITEM_SOURCE");
  }
  return sources;
}

async function assertAllReviewIntegrity(
  tx: Transaction,
  proposal: ProposalRow,
  reviews: ReviewRow[]
): Promise<void> {
  const sources = await loadFieldSources(tx, proposal);
  for (const review of reviews) {
    assertReviewMetadata(review);
    if (review.decision === "PENDING") {
      throw new ProposalReviewError("AI_PROPOSAL_REVIEW_REQUIRED");
    }
    const preferred = review.preferred_source_id
      ? sources.find(
          (source) =>
            source.field_review_id === review.id && source.source_id === review.preferred_source_id
        )
      : null;
    if (review.preferred_source_id && !preferred) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
    }
    if (preferred) {
      const allowed =
        review.decision === "ACCEPTED"
          ? preferred.relationship === "SUPPORTS"
          : review.verification_state === "SOURCE_CONFLICT"
            ? preferred.relationship === "SUPPORTS" || preferred.relationship === "CONFLICTS"
            : preferred.relationship === "SUPPORTS";
      if (!allowed || !jsonEqual(preferred.source_value, review.selected_value)) {
        throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
      }
    }
    if (
      review.verification_state === "SOURCE_CONFLICT" &&
      review.decision === "ACCEPTED" &&
      !preferred
    ) {
      throw new ProposalReviewError("AI_PROPOSAL_UNRESOLVED_CONFLICT");
    }
  }
}

function effectiveRequiredString(row: ReviewRow | undefined, kind: "slug" | "name"): string {
  if (!row || (row.decision !== "ACCEPTED" && row.decision !== "MANUALLY_EDITED")) {
    throw new ProposalReviewError(
      kind === "slug" ? "AI_PROPOSAL_INVALID_SLUG" : "AI_PROPOSAL_INVALID_NAME"
    );
  }
  return kind === "slug"
    ? normalizeProposalSlug(row.selected_value)
    : normalizeProposalName(row.selected_value);
}

async function assertPublishedRecord(
  tx: Transaction,
  table: "brands" | "categories",
  id: string,
  code: "AI_PROPOSAL_INVALID_BRAND" | "AI_PROPOSAL_INVALID_CATEGORY"
): Promise<void> {
  const relation = table === "brands" ? sql`brands` : sql`categories`;
  const [record] = rows<{ status: string }>(
    await tx.execute(sql`SELECT status FROM ${relation} WHERE id = ${id}::uuid LIMIT 1`)
  );
  if (!record || record.status !== "PUBLISHED") throw new ProposalReviewError(code);
}

async function validateEffectiveSpecifications(
  tx: Transaction,
  proposal: ProposalRow,
  reviews: ReviewRow[],
  categoryId: string
): Promise<Record<string, unknown>> {
  if (!isPlainRecord(proposal.proposed_specifications)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  const proposedKeys = Object.keys(proposal.proposed_specifications);
  if (proposedKeys.some((key) => classifyProposalFieldPath(key) !== "SPECIFICATION")) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  const mapped = reviewMap(reviews);
  for (const key of proposedKeys) {
    const review = mapped.get(key);
    if (!review || !jsonEqual(review.proposed_value, proposal.proposed_specifications[key])) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
  }
  for (const review of reviews) {
    if (!CONTEXTUAL_FIELDS.has(review.field_path) && !proposedKeys.includes(review.field_path)) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
  }
  const effectiveSpecs: Record<string, unknown> = {};
  for (const key of proposedKeys) {
    const review = mapped.get(key)!;
    if (review.decision === "ACCEPTED" || review.decision === "MANUALLY_EDITED") {
      effectiveSpecs[key] = review.selected_value;
    }
  }
  let authoritative;
  try {
    authoritative = await resolveAuthoritativeCategorySpecificationSchema(categoryId, tx);
  } catch {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (!authoritative.hasSchema) {
    if (Object.keys(effectiveSpecs).length > 0) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    return effectiveSpecs;
  }
  const validation = validateProductSpecificationValues(
    authoritative.schema!.fieldDefinitions,
    effectiveSpecs
  );
  if (!validation.success) throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  return validation.specValues ?? {};
}

function assertContextualMirrors(proposal: ProposalRow, mapped: Map<string, ReviewRow>): void {
  const expected = new Map<string, unknown>();
  expected.set("copy.name", proposal.proposed_name);
  if (proposal.proposed_subtitle !== null) {
    expected.set("copy.subtitle", proposal.proposed_subtitle);
  }
  if (proposal.proposed_description !== null) {
    expected.set("copy.description", proposal.proposed_description);
  }
  if (!isPlainRecord(proposal.proposed_seo_draft)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  for (const [key, fieldPath] of [
    ["title", "seo.title"],
    ["description", "seo.description"],
  ] as const) {
    const value = proposal.proposed_seo_draft[key];
    if (value !== null && value !== undefined) expected.set(fieldPath, value);
  }
  if (!isPlainRecord(proposal.unmapped_specifications)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (Object.keys(proposal.unmapped_specifications).length > 0) {
    expected.set("research.unmappedSpecifications", proposal.unmapped_specifications);
  }
  if (!Array.isArray(proposal.proposed_variants) || !Array.isArray(proposal.media_candidates)) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  if (proposal.proposed_variants.length > 0) {
    expected.set("research.variants", proposal.proposed_variants);
  }
  if (proposal.media_candidates.length > 0) {
    expected.set("research.mediaCandidates", proposal.media_candidates);
  }
  for (const [fieldPath, proposedValue] of expected) {
    const row = mapped.get(fieldPath);
    if (!row || !jsonEqual(row.proposed_value, proposedValue)) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
  }
  for (const fieldPath of CONTEXTUAL_FIELDS) {
    if (fieldPath.startsWith("catalog.")) continue;
    const row = mapped.get(fieldPath);
    if (row && !expected.has(fieldPath)) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
  }
}

function validateEffectiveContextualValues(mapped: Map<string, ReviewRow>): void {
  for (const [fieldPath, maxLength] of [
    ["copy.subtitle", 255],
    ["copy.description", 8_000],
    ["seo.title", 70],
    ["seo.description", 170],
  ] as const) {
    const row = mapped.get(fieldPath);
    if (row && (row.decision === "ACCEPTED" || row.decision === "MANUALLY_EDITED")) {
      normalizeOptionalCopy(row.selected_value, maxLength);
    }
  }
}

function validateVariantReview(reviews: Map<string, ReviewRow>): void {
  const variantReview = reviews.get("research.variants");
  if (!variantReview) return;
  if (variantReview.decision === "ACCEPTED") {
    throw new ProposalReviewError("AI_PROPOSAL_HUMAN_PRICE_REQUIRED");
  }
  if (
    variantReview.decision === "MANUALLY_EDITED" &&
    !isCanonicalVariantPlan(variantReview.selected_value)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
  }
}

function effectiveOptionalCopy(
  mapped: Map<string, ReviewRow>,
  fieldPath: "copy.subtitle" | "copy.description",
  maxLength: number
): string | null {
  const row = mapped.get(fieldPath);
  if (!row || row.decision === "REJECTED") return null;
  if (row.decision !== "ACCEPTED" && row.decision !== "MANUALLY_EDITED") {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  return normalizeOptionalCopy(row.selected_value, maxLength);
}

export async function deriveApprovedProposalApplyProjection(
  tx: Transaction,
  proposalId: string,
  expectedStatus: "APPROVED" | "APPLYING" | "APPLIED"
): Promise<ApprovedProposalApplyProjection> {
  const proposal = await loadProposal(tx, proposalId, true);
  await lockAndRefreshItem(tx, proposal);
  if (proposal.status !== expectedStatus) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  const expectedItemStatus = expectedStatus === "APPLIED" ? "APPLIED" : "APPROVED";
  if (proposal.item_status !== expectedItemStatus) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE");
  }
  if (!proposal.reviewed_by_auth_user_id || !proposal.reviewed_at) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }
  assertItemModeInvariant(proposal);
  if (normalizeProposalSlug(proposal.proposed_slug) !== proposal.proposed_slug) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_SLUG");
  }

  const reviews = await loadReviews(tx, proposal.id, true);
  assertCopyNameMirror(proposal, reviews);
  const mapped = assertCatalogLedger(proposal, reviews);
  assertContextualMirrors(proposal, mapped);
  await assertAllReviewIntegrity(tx, proposal, reviews);
  const brandId = effectiveCatalogId(mapped.get("catalog.brandId")!);
  const categoryId = effectiveCatalogId(mapped.get("catalog.categoryId")!);
  if (!brandId) throw new ProposalReviewError("AI_PROPOSAL_INVALID_BRAND");
  if (!categoryId) throw new ProposalReviewError("AI_PROPOSAL_INVALID_CATEGORY");
  await assertPublishedRecord(tx, "brands", brandId, "AI_PROPOSAL_INVALID_BRAND");
  await assertPublishedRecord(tx, "categories", categoryId, "AI_PROPOSAL_INVALID_CATEGORY");
  const slug = effectiveRequiredString(mapped.get("catalog.slug"), "slug");
  const name = effectiveRequiredString(mapped.get("copy.name"), "name");
  validateEffectiveContextualValues(mapped);
  validateVariantReview(mapped);
  const specifications = await validateEffectiveSpecifications(tx, proposal, reviews, categoryId);

  const reviewAuditRows = rows<Record<string, unknown>>(
    await tx.execute(sql`
      SELECT actor_type, actor_id, target_type, target_id, metadata
      FROM audit_events
      WHERE action = ${AI_AUDIT_ACTIONS.AI_PROPOSAL_REVIEWED}
        AND target_id = ${proposal.id}
      ORDER BY timestamp, id
    `)
  );
  const expectedReviewMetadata = {
    proposalId: proposal.id,
    ...computeProposalReviewCounts(reviews),
  };
  const reviewAudit = reviewAuditRows[0];
  if (
    reviewAuditRows.length !== 1 ||
    !reviewAudit ||
    reviewAudit.actor_type !== "ADMIN" ||
    reviewAudit.actor_id !== proposal.reviewed_by_auth_user_id ||
    reviewAudit.target_type !== "ai_product_proposal" ||
    reviewAudit.target_id !== proposal.id ||
    !jsonEqual(reviewAudit.metadata, expectedReviewMetadata)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
  }

  const variantReview = mapped.get("research.variants");
  const variants =
    variantReview?.decision === "MANUALLY_EDITED" &&
    isCanonicalVariantPlan(variantReview.selected_value)
      ? variantReview.selected_value
      : [];
  const subtitle = effectiveOptionalCopy(mapped, "copy.subtitle", 255);
  const description = effectiveOptionalCopy(mapped, "copy.description", 8_000);
  const product: ApprovedProposalApplyProjection["product"] = {
    brandId,
    categoryId,
    slug,
    name,
  };
  if (proposal.item_mode === "CREATE") {
    product.subtitle = subtitle;
    product.description = description;
  } else {
    if (subtitle !== null) product.subtitle = subtitle;
    if (description !== null) product.description = description;
  }

  return {
    proposalId: proposal.id,
    itemId: proposal.job_item_id,
    mode: proposal.item_mode as "CREATE" | "ENRICH",
    targetProductId: proposal.target_product_id,
    targetProductVersionSnapshot: toIso(proposal.target_product_version_snapshot),
    product,
    specifications,
    variants,
  };
}

async function assertTerminalReplay(
  tx: Transaction,
  proposal: ProposalRow,
  requestedStatus: "APPROVED" | "REJECTED",
  actorId: string,
  reviews: ReviewRow[]
): Promise<ProposalMutationResult> {
  if (!isSameTerminalDecision(proposal.status, requestedStatus)) {
    throw new ProposalReviewError("AI_PROPOSAL_NOT_DRAFT", undefined, 409);
  }
  const auditRows = rows<Record<string, unknown>>(
    await tx.execute(sql`
      SELECT actor_type, actor_id, target_type, target_id, metadata
      FROM audit_events
      WHERE action = ${AI_AUDIT_ACTIONS.AI_PROPOSAL_REVIEWED}
        AND target_id = ${proposal.id}
      ORDER BY timestamp, id
    `)
  );
  const expectedMetadata = { proposalId: proposal.id, ...computeProposalReviewCounts(reviews) };
  const audit = auditRows[0];
  if (
    auditRows.length !== 1 ||
    !audit ||
    audit.actor_type !== "ADMIN" ||
    audit.actor_id !== actorId ||
    audit.target_type !== "ai_product_proposal" ||
    audit.target_id !== proposal.id ||
    !jsonEqual(audit.metadata, expectedMetadata) ||
    proposal.reviewed_by_auth_user_id !== actorId ||
    !proposal.reviewed_at ||
    proposal.applied_product_id !== null ||
    proposal.applied_at !== null ||
    (requestedStatus === "APPROVED"
      ? proposal.item_status !== "APPROVED"
      : !ITEM_REVIEWABLE_STATES.has(proposal.item_status))
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR", undefined, 409);
  }
  return {
    proposalId: proposal.id,
    status: requestedStatus,
    proposalUpdatedAt: asDate(proposal.updated_at).toISOString(),
    replayed: true,
  };
}

function assertItemModeInvariant(proposal: ProposalRow): void {
  const createValid =
    proposal.item_mode === "CREATE" &&
    proposal.target_product_id === null &&
    proposal.target_product_version_snapshot === null;
  const enrichValid =
    proposal.item_mode === "ENRICH" &&
    proposal.target_product_id !== null &&
    proposal.target_product_version_snapshot !== null;
  if (!createValid && !enrichValid) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE");
  }
}

async function finalizeProposal(
  rawInput: ProposalVersionInput,
  requestedStatus: "APPROVED" | "REJECTED",
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  const actor = await resolveActor(options);
  const input = proposalVersionInputSchema.parse(rawInput);
  return await db.transaction(async (tx) => {
    const proposal = await loadProposal(tx, input.proposalId, true);
    await lockAndRefreshItem(tx, proposal);
    const reviews = await loadReviews(tx, proposal.id, true);
    if (proposal.status !== "DRAFT") {
      return await assertTerminalReplay(tx, proposal, requestedStatus, actor.authUserId, reviews);
    }
    assertVersion(proposal, input.expectedProposalUpdatedAt);
    if (!ITEM_REVIEWABLE_STATES.has(proposal.item_status)) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_ITEM_LIFECYCLE", undefined, 409);
    }
    assertItemModeInvariant(proposal);
    if (proposal.applied_product_id !== null || proposal.applied_at !== null) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }
    const existingAuditCount = rows<{ count: number }>(
      await tx.execute(sql`
        SELECT count(*)::int AS count FROM audit_events
        WHERE action = ${AI_AUDIT_ACTIONS.AI_PROPOSAL_REVIEWED}
          AND target_id = ${proposal.id}
      `)
    )[0]?.count;
    if (existingAuditCount !== 0) {
      throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    }

    if (requestedStatus === "APPROVED") {
      if (normalizeProposalSlug(proposal.proposed_slug) !== proposal.proposed_slug) {
        throw new ProposalReviewError("AI_PROPOSAL_INVALID_SLUG");
      }
      assertCopyNameMirror(proposal, reviews);
      const mapped = assertCatalogLedger(proposal, reviews);
      assertContextualMirrors(proposal, mapped);
      await assertAllReviewIntegrity(tx, proposal, reviews);
      const brandId = effectiveCatalogId(mapped.get("catalog.brandId")!);
      const categoryId = effectiveCatalogId(mapped.get("catalog.categoryId")!);
      if (!brandId) throw new ProposalReviewError("AI_PROPOSAL_INVALID_BRAND");
      if (!categoryId) throw new ProposalReviewError("AI_PROPOSAL_INVALID_CATEGORY");
      await assertPublishedRecord(tx, "brands", brandId, "AI_PROPOSAL_INVALID_BRAND");
      await assertPublishedRecord(tx, "categories", categoryId, "AI_PROPOSAL_INVALID_CATEGORY");
      effectiveRequiredString(mapped.get("catalog.slug"), "slug");
      effectiveRequiredString(mapped.get("copy.name"), "name");
      validateEffectiveContextualValues(mapped);
      validateVariantReview(mapped);
      await validateEffectiveSpecifications(tx, proposal, reviews, categoryId);
    }

    const counts = computeProposalReviewCounts(reviews);
    const reviewedAt = new Date().toISOString();
    const [updated] = rows<{ updated_at: Date | string }>(
      await tx.execute(sql`
        UPDATE ai_product_proposals
        SET status = ${requestedStatus},
            reviewed_by_auth_user_id = ${actor.authUserId}::uuid,
            reviewed_at = ${reviewedAt},
            updated_at = GREATEST(
              date_trunc('milliseconds', clock_timestamp()),
              date_trunc('milliseconds', updated_at) + interval '1 millisecond'
            )
        WHERE id = ${proposal.id}::uuid
        RETURNING updated_at
      `)
    );
    if (!updated) throw new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR");
    if (requestedStatus === "APPROVED") {
      await tx.execute(sql`
        UPDATE ai_research_job_items
        SET status = 'APPROVED',
            updated_at = GREATEST(
              date_trunc('milliseconds', clock_timestamp()),
              date_trunc('milliseconds', updated_at) + interval '1 millisecond'
            )
        WHERE id = ${proposal.job_item_id}::uuid
      `);
    }
    await tx.execute(sql`
      INSERT INTO audit_events (
        id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
      ) VALUES (
        ${generateUuidV7()}::uuid,
        ${reviewedAt},
        'ADMIN',
        ${actor.authUserId},
        ${AI_AUDIT_ACTIONS.AI_PROPOSAL_REVIEWED},
        'ai_product_proposal',
        ${proposal.id},
        ${JSON.stringify({ proposalId: proposal.id, ...counts })}::jsonb,
        NULL
      )
    `);
    return {
      proposalId: proposal.id,
      status: requestedStatus,
      proposalUpdatedAt: asDate(updated.updated_at).toISOString(),
      replayed: false,
    };
  });
}

export async function approveProposal(
  input: ProposalVersionInput,
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  return await finalizeProposal(input, "APPROVED", options);
}

export async function rejectProposal(
  input: ProposalVersionInput,
  options?: ProposalReviewServiceOptions
): Promise<ProposalMutationResult> {
  return await finalizeProposal(input, "REJECTED", options);
}
