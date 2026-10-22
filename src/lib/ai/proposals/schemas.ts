import { z } from "zod";
import { parsePenInputToCents } from "@/lib/admin/catalog/money";
import { isPlainRecord } from "@/lib/admin/catalog/record";
import { PRODUCT_SLUG_REGEX } from "@/lib/admin/catalog/publish-readiness";
import { pdpSizeSchema, productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";
import {
  PROPOSAL_REVIEW_DECISIONS,
  ProposalReviewError,
  type NormalizedVariantPlanEntry,
} from "./types";

const UUID_SCHEMA = z.string().uuid();
const ISO_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });

export const proposalVersionInputSchema = z.object({
  proposalId: UUID_SCHEMA,
  expectedProposalUpdatedAt: ISO_TIMESTAMP_SCHEMA,
});

export const proposalReadInputSchema = z.object({ proposalId: UUID_SCHEMA });

export const proposalFieldDecisionInputSchema = proposalVersionInputSchema.extend({
  fieldPath: z.string().trim().min(1).max(100),
  decision: z.enum(PROPOSAL_REVIEW_DECISIONS),
  selectedValue: z.unknown().optional(),
  preferredSourceId: UUID_SCHEMA.nullable().optional(),
});

export const humanVariantPlanEntryInputSchema = z
  .object({
    sku: z.string(),
    title: z.string(),
    pricePen: z.string(),
    compareAtPricePen: z.string().optional(),
    costPen: z.string().optional(),
    weightGrams: z.number().int().positive().max(2_147_483_647).nullable().optional(),
    attributes: z.record(z.string()).optional(),
  })
  .strict();

export const humanVariantPlanInputSchema = proposalVersionInputSchema.extend({
  variants: z.array(humanVariantPlanEntryInputSchema).min(1).max(100),
});

export type ProposalVersionInput = z.infer<typeof proposalVersionInputSchema>;
export type ProposalFieldDecisionInput = z.infer<typeof proposalFieldDecisionInputSchema>;
export type HumanVariantPlanInput = z.infer<typeof humanVariantPlanInputSchema>;

export type ProposalFieldPathKind =
  "CATALOG" | "COPY" | "SEO" | "RESEARCH" | "PDP" | "RESERVED" | "SPECIFICATION";

const reviewText = (max: number) => z.string().trim().min(1).max(max);
export const pdpProposalFieldsSchema = z
  .object({
    "pdp.sizes": z.array(pdpSizeSchema).max(6).optional(),
    "pdp.packageContents": z
      .array(
        z
          .object({
            edition: reviewText(80),
            items: z
              .array(
                z
                  .object({
                    name: reviewText(100),
                    quantity: z.string().trim().max(20).optional(),
                    note: z.string().trim().max(160).optional(),
                  })
                  .strict()
              )
              .max(30),
          })
          .strict()
      )
      .max(2)
      .optional(),
    "pdp.support.warranty": productPdpConfigSchema.shape.support
      .removeDefault()
      .shape.warranty.optional(),
    "pdp.support.manualUrl": productPdpConfigSchema.shape.support
      .removeDefault()
      .shape.manualUrl.optional(),
    "pdp.support.driverUrl": productPdpConfigSchema.shape.support
      .removeDefault()
      .shape.driverUrl.optional(),
    "pdp.highlights": productPdpConfigSchema.shape.specifications.removeDefault().optional(),
  })
  .strict();

export function parsePdpProposalField(fieldPath: string, value: unknown): unknown {
  const parsed = pdpProposalFieldsSchema.safeParse({ [fieldPath]: value });
  if (!parsed.success) throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  return parsed.data[fieldPath as keyof typeof parsed.data];
}

const KNOWN_CATALOG_PATHS = new Set(["catalog.brandId", "catalog.categoryId", "catalog.slug"]);
const KNOWN_COPY_PATHS = new Set(["copy.name", "copy.subtitle", "copy.description"]);
const KNOWN_SEO_PATHS = new Set(["seo.title", "seo.description"]);
const KNOWN_RESEARCH_PATHS = new Set([
  "research.unmappedSpecifications",
  "research.variants",
  "research.mediaCandidates",
]);

export function classifyProposalFieldPath(fieldPath: string): ProposalFieldPathKind {
  if (KNOWN_CATALOG_PATHS.has(fieldPath)) return "CATALOG";
  if (KNOWN_COPY_PATHS.has(fieldPath)) return "COPY";
  if (KNOWN_SEO_PATHS.has(fieldPath)) return "SEO";
  if (KNOWN_RESEARCH_PATHS.has(fieldPath)) return "RESEARCH";
  if (Object.hasOwn(pdpProposalFieldsSchema.shape, fieldPath)) return "PDP";
  if (
    ["catalog.", "copy.", "seo.", "research.", "pdp."].some((root) => fieldPath.startsWith(root))
  ) {
    return "RESERVED";
  }
  return "SPECIFICATION";
}

export function computeProposalReviewCounts(reviews: Array<{ decision: string }>): {
  approvedFieldsCount: number;
  rejectedFieldsCount: number;
} {
  return {
    approvedFieldsCount: reviews.filter(
      (review) => review.decision === "ACCEPTED" || review.decision === "MANUALLY_EDITED"
    ).length,
    rejectedFieldsCount: reviews.filter((review) => review.decision === "REJECTED").length,
  };
}

export function isSameTerminalDecision(
  currentStatus: string,
  requestedStatus: "APPROVED" | "REJECTED"
): boolean {
  return currentStatus === requestedStatus;
}

function sourceJsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sourceJsonEqual(value, right[index]))
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      sourceJsonEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => sourceJsonEqual(left[key], right[key]))
    );
  }
  return false;
}

export function validateSourceResolutionSemantics(input: {
  decision: "PENDING" | "ACCEPTED" | "REJECTED" | "MANUALLY_EDITED";
  verificationState: string;
  selectedValue: unknown;
  preferredSource: { relationship: string; sourceValue: unknown } | null;
}): void {
  const conflict = input.verificationState === "SOURCE_CONFLICT";
  if (input.decision === "PENDING" || input.decision === "REJECTED") {
    if (input.preferredSource) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
    }
    return;
  }
  if (conflict && input.decision === "ACCEPTED" && !input.preferredSource) {
    throw new ProposalReviewError("AI_PROPOSAL_UNRESOLVED_CONFLICT");
  }
  if (!input.preferredSource) return;
  const relationshipAllowed =
    input.decision === "ACCEPTED"
      ? input.preferredSource.relationship === "SUPPORTS"
      : conflict
        ? ["SUPPORTS", "CONFLICTS"].includes(input.preferredSource.relationship)
        : input.preferredSource.relationship === "SUPPORTS";
  if (
    !relationshipAllowed ||
    !sourceJsonEqual(input.preferredSource.sourceValue, input.selectedValue)
  ) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_PREFERRED_SOURCE");
  }
}

export function normalizeProposalSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_SLUG");
  }
  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 200 || !PRODUCT_SLUG_REGEX.test(slug)) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_SLUG");
  }
  return slug;
}

export function normalizeProposalName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_NAME");
  }
  const name = value.trim();
  if (!name || name.length > 200) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_NAME");
  }
  return name;
}

export function normalizeOptionalCopy(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_DECISION");
  }
  return normalized;
}

function parseMoney(raw: string | undefined, field: Parameters<typeof parsePenInputToCents>[1]) {
  const parsed = parsePenInputToCents(raw ?? "", field);
  if (!parsed.success) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
  }
  return parsed.cents;
}

export function normalizeHumanVariantPlan(raw: unknown): NormalizedVariantPlanEntry[] {
  const parsed = z.array(humanVariantPlanEntryInputSchema).min(1).max(100).safeParse(raw);
  if (!parsed.success) {
    throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
  }

  const skus = new Set<string>();
  return parsed.data.map((entry, displayOrder) => {
    const sku = entry.sku.trim();
    const title = entry.title.trim();
    if (!sku || sku.length > 50 || skus.has(sku)) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
    }
    if (!title || title.length > 150 || !isPlainRecord(entry.attributes ?? {})) {
      throw new ProposalReviewError("AI_PROPOSAL_INVALID_VARIANT_PLAN");
    }
    skus.add(sku);
    const priceCents = parseMoney(entry.pricePen, "price_cents");
    if (priceCents === null) {
      throw new ProposalReviewError("AI_PROPOSAL_HUMAN_PRICE_REQUIRED");
    }
    return {
      sku,
      title,
      priceCents,
      compareAtPriceCents: parseMoney(entry.compareAtPricePen, "compare_at_price_cents"),
      costCents: parseMoney(entry.costPen, "cost_cents"),
      weightGrams: entry.weightGrams ?? null,
      attributes: entry.attributes ?? {},
      displayOrder,
    };
  });
}

export function isCanonicalVariantPlan(value: unknown): value is NormalizedVariantPlanEntry[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const skus = new Set<string>();
  return value.every((entry, index) => {
    if (!isPlainRecord(entry)) return false;
    const keys = Object.keys(entry).sort();
    const expectedKeys = [
      "attributes",
      "compareAtPriceCents",
      "costCents",
      "displayOrder",
      "priceCents",
      "sku",
      "title",
      "weightGrams",
    ].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) return false;
    if (
      typeof entry.sku !== "string" ||
      entry.sku !== entry.sku.trim() ||
      !entry.sku ||
      entry.sku.length > 50 ||
      skus.has(entry.sku) ||
      typeof entry.title !== "string" ||
      entry.title !== entry.title.trim() ||
      !entry.title ||
      entry.title.length > 150 ||
      typeof entry.priceCents !== "number" ||
      !Number.isInteger(entry.priceCents) ||
      entry.priceCents < 1 ||
      entry.priceCents > 2_147_483_647 ||
      entry.displayOrder !== index ||
      !isPlainRecord(entry.attributes) ||
      Object.values(entry.attributes).some((item) => typeof item !== "string")
    ) {
      return false;
    }
    for (const optionalMoney of [entry.compareAtPriceCents, entry.costCents]) {
      if (
        optionalMoney !== null &&
        (typeof optionalMoney !== "number" ||
          !Number.isInteger(optionalMoney) ||
          optionalMoney < 0 ||
          optionalMoney > 2_147_483_647)
      ) {
        return false;
      }
    }
    if (
      entry.weightGrams !== null &&
      (typeof entry.weightGrams !== "number" ||
        !Number.isInteger(entry.weightGrams) ||
        entry.weightGrams < 1 ||
        entry.weightGrams > 2_147_483_647)
    ) {
      return false;
    }
    skus.add(entry.sku);
    return true;
  });
}
