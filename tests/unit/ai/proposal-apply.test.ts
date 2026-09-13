import { describe, expect, it } from "vitest";
import { computeRequestFingerprint } from "@/lib/admin/catalog/crypto";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  ProductStatusGuardError,
  StaleWriteConflictError,
} from "@/lib/admin/catalog/types";
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
  productCreateApplyPayloadSchema,
  proposalApplyInputSchema,
  variantCreateApplyPayloadSchema,
} from "@/lib/ai/proposals/apply-schemas";
import { ProposalApplyError, ProposalReviewError } from "@/lib/ai/proposals/types";
import type { ApprovedProposalApplyProjection } from "@/lib/ai/proposals/types";

describe("GP-025 / CHK3-C — proposal apply contracts", () => {
  const operationId = "018f0025-4000-7000-8000-000000000001";
  const productId = "018f0025-4000-7000-8000-000000000002";
  const brandId = "018f0025-4000-7000-8000-000000000003";
  const categoryId = "018f0025-4000-7000-8000-000000000004";
  const expectedUpdatedAt = "2026-09-12T12:00:00.000Z";

  const productCreatePayload = {
    name: "Mouse humano",
    slug: "mouse-humano",
    brandId,
    categoryId,
    subtitle: null,
    description: "Descripción revisada",
    isFeatured: false as const,
  };
  const variantPayload = {
    productId,
    sku: "HUMAN-SKU",
    title: "Negro",
    priceCents: 19_990,
    compareAtPriceCents: 22_990,
    costCents: 10_000,
    weightGrams: 54,
    attributes: { color: "black" },
    status: "ACTIVE" as const,
    displayOrder: 0,
  };

  const createProjection: ApprovedProposalApplyProjection = {
    proposalId: productId,
    itemId: brandId,
    mode: "CREATE",
    targetProductId: null,
    targetProductVersionSnapshot: null,
    product: {
      brandId,
      categoryId,
      name: productCreatePayload.name,
      slug: productCreatePayload.slug,
      subtitle: null,
      description: productCreatePayload.description,
    },
    specifications: { weight_g: 54 },
    variants: [
      {
        sku: variantPayload.sku,
        title: variantPayload.title,
        priceCents: variantPayload.priceCents,
        compareAtPriceCents: variantPayload.compareAtPriceCents,
        costCents: variantPayload.costCents,
        weightGrams: variantPayload.weightGrams,
        attributes: variantPayload.attributes,
        displayOrder: variantPayload.displayOrder,
      },
    ],
  };

  it("accepts only a proposal identifier at the public action boundary", () => {
    expect(proposalApplyInputSchema.parse({ proposalId: productId })).toEqual({
      proposalId: productId,
    });
    expect(() =>
      proposalApplyInputSchema.parse({ proposalId: productId, actorId: productId })
    ).toThrow();
    expect(() =>
      proposalApplyInputSchema.parse({ proposalId: productId, applyOperationId: operationId })
    ).toThrow();
  });

  it("parses only the three canonical step-key families", () => {
    expect(parseApplyStepKey("PRODUCT_CREATE")).toEqual({ kind: "PRODUCT_CREATE" });
    expect(parseApplyStepKey("PRODUCT_UPDATE")).toEqual({ kind: "PRODUCT_UPDATE" });
    expect(parseApplyStepKey("VARIANT_CREATE:7")).toEqual({ kind: "VARIANT_CREATE", index: 7 });
    for (const invalid of ["VARIANT_CREATE:01", "VARIANT_UPDATE:0", "PRODUCT_DELETE", ""]) {
      expect(() => parseApplyStepKey(invalid)).toThrow(ProposalApplyError);
    }
  });

  it("freezes CREATE and ENRICH ordinal allocation with allowed gaps", () => {
    expect(expectedApplyStepOrdinal("CREATE", "PRODUCT_CREATE")).toBe(0);
    expect(expectedApplyStepOrdinal("CREATE", "PRODUCT_UPDATE")).toBe(1);
    expect(expectedApplyStepOrdinal("CREATE", "VARIANT_CREATE:0")).toBe(2);
    expect(expectedApplyStepOrdinal("ENRICH", "PRODUCT_UPDATE")).toBe(0);
    expect(expectedApplyStepOrdinal("ENRICH", "VARIANT_CREATE:0")).toBe(1);
    expect(() => expectedApplyStepOrdinal("ENRICH", "PRODUCT_CREATE")).toThrow(ProposalApplyError);
  });

  it("calculates the exact required CREATE step set", () => {
    expect(
      buildRequiredApplySteps({ mode: "CREATE", includeProductUpdate: true, variantCount: 2 })
    ).toEqual([
      { stepKey: "PRODUCT_CREATE", stepOrdinal: 0 },
      { stepKey: "PRODUCT_UPDATE", stepOrdinal: 1 },
      { stepKey: "VARIANT_CREATE:0", stepOrdinal: 2 },
      { stepKey: "VARIANT_CREATE:1", stepOrdinal: 3 },
    ]);
    expect(
      buildRequiredApplySteps({ mode: "CREATE", includeProductUpdate: false, variantCount: 1 })
    ).toEqual([
      { stepKey: "PRODUCT_CREATE", stepOrdinal: 0 },
      { stepKey: "VARIANT_CREATE:0", stepOrdinal: 2 },
    ]);
  });

  it("calculates the exact required ENRICH step set", () => {
    expect(
      buildRequiredApplySteps({ mode: "ENRICH", includeProductUpdate: true, variantCount: 2 })
    ).toEqual([
      { stepKey: "PRODUCT_UPDATE", stepOrdinal: 0 },
      { stepKey: "VARIANT_CREATE:0", stepOrdinal: 1 },
      { stepKey: "VARIANT_CREATE:1", stepOrdinal: 2 },
    ]);
    expect(() =>
      buildRequiredApplySteps({ mode: "ENRICH", includeProductUpdate: false, variantCount: 0 })
    ).toThrow(ProposalApplyError);
  });

  it("projects CREATE into one initial step and target-bound downstream steps", () => {
    const initial = buildInitialApplyStepDefinitions(operationId, createProjection);
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      mutationRequestId: `ai-apply-${operationId}-product-create`,
      requestPayload: productCreatePayload,
    });
    const downstream = buildCreateDownstreamStepDefinitions(
      operationId,
      createProjection,
      productId,
      expectedUpdatedAt
    );
    expect(downstream.map(({ stepKey, stepOrdinal }) => ({ stepKey, stepOrdinal }))).toEqual([
      { stepKey: "PRODUCT_UPDATE", stepOrdinal: 1 },
      { stepKey: "VARIANT_CREATE:0", stepOrdinal: 2 },
    ]);
    expect(downstream[0]!.requestPayload).toEqual({
      productId,
      expectedUpdatedAt,
      specValues: { weight_g: 54 },
    });
    expect(downstream[1]!.requestPayload).toEqual(variantPayload);
  });

  it("projects ENRICH from the frozen target/version and omits absent optional copy", () => {
    const enrichProjection: ApprovedProposalApplyProjection = {
      ...createProjection,
      mode: "ENRICH",
      targetProductId: productId,
      targetProductVersionSnapshot: expectedUpdatedAt,
      product: {
        brandId,
        categoryId,
        name: productCreatePayload.name,
        slug: productCreatePayload.slug,
      },
    };
    const definitions = buildInitialApplyStepDefinitions(operationId, enrichProjection);
    expect(definitions.map(({ stepKey, stepOrdinal }) => ({ stepKey, stepOrdinal }))).toEqual([
      { stepKey: "PRODUCT_UPDATE", stepOrdinal: 0 },
      { stepKey: "VARIANT_CREATE:0", stepOrdinal: 1 },
    ]);
    expect(definitions[0]!.requestPayload).toEqual({
      productId,
      expectedUpdatedAt,
      name: productCreatePayload.name,
      slug: productCreatePayload.slug,
      brandId,
      categoryId,
      specValues: { weight_g: 54 },
    });
    expect(definitions[0]!.requestPayload).not.toHaveProperty("subtitle");
    expect(definitions[0]!.requestPayload).not.toHaveProperty("description");
    expect(definitions.filter(({ stepKey }) => stepKey.startsWith("VARIANT_CREATE:"))).toHaveLength(
      1
    );
  });

  it("derives exact stable mutation IDs from the server operation UUID", () => {
    expect(deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE")).toBe(
      `ai-apply-${operationId}-product-create`
    );
    expect(deriveApplyMutationRequestId(operationId, "PRODUCT_UPDATE")).toBe(
      `ai-apply-${operationId}-product-update`
    );
    expect(deriveApplyMutationRequestId(operationId, "VARIANT_CREATE:4")).toBe(
      `ai-apply-${operationId}-variant-create-4`
    );
  });

  it("enforces an exact PRODUCT_CREATE payload without initialVariant", () => {
    expect(productCreateApplyPayloadSchema.parse(productCreatePayload)).toEqual(
      productCreatePayload
    );
    expect(() =>
      productCreateApplyPayloadSchema.parse({
        ...productCreatePayload,
        initialVariant: variantPayload,
      })
    ).toThrow();
    expect(() =>
      productCreateApplyPayloadSchema.parse({ ...productCreatePayload, isFeatured: true })
    ).toThrow();
  });

  it("keeps CREATE PRODUCT_UPDATE minimal and ENRICH mapping explicit", () => {
    const createUpdate = { productId, expectedUpdatedAt, specValues: { weight_g: 54 } };
    expect(createProductUpdateApplyPayloadSchema.parse(createUpdate)).toEqual(createUpdate);
    expect(() =>
      createProductUpdateApplyPayloadSchema.parse({ ...createUpdate, name: "Not minimal" })
    ).toThrow();

    const enrichUpdate = {
      ...createUpdate,
      name: "Mouse humano",
      slug: "mouse-humano",
      brandId,
      categoryId,
    };
    expect(enrichProductUpdateApplyPayloadSchema.parse(enrichUpdate)).toEqual(enrichUpdate);
    expect(() => enrichProductUpdateApplyPayloadSchema.parse(createUpdate)).toThrow();
  });

  it("accepts only normalized human-priced Variant payloads", () => {
    expect(variantCreateApplyPayloadSchema.parse(variantPayload)).toEqual(variantPayload);
    expect(() =>
      variantCreateApplyPayloadSchema.parse({ ...variantPayload, pricePen: "199.90" })
    ).toThrow();
    expect(() =>
      variantCreateApplyPayloadSchema.parse({ ...variantPayload, priceCents: 199.9 })
    ).toThrow();
  });

  it("selects the strict payload schema by mode and step kind", () => {
    expect(parseApplyStepPayload("CREATE", "PRODUCT_CREATE", productCreatePayload)).toEqual(
      productCreatePayload
    );
    expect(parseApplyStepPayload("CREATE", "VARIANT_CREATE:0", variantPayload)).toEqual(
      variantPayload
    );
    expect(() => parseApplyStepPayload("ENRICH", "PRODUCT_CREATE", productCreatePayload)).toThrow(
      ProposalApplyError
    );
  });

  it("verifies the canonical request fingerprint and detects corruption", () => {
    const fingerprint = computeRequestFingerprint(variantPayload);
    expect(() => assertApplyStepFingerprint(variantPayload, fingerprint)).not.toThrow();
    expect(() =>
      assertApplyStepFingerprint({ ...variantPayload, priceCents: 1 }, fingerprint)
    ).toThrow(ProposalApplyError);
  });

  it("classifies catalog and integrity failures as terminal", () => {
    for (const error of [
      new CatalogDomainError("Conflict", "SKU_CONFLICT", 409),
      new CatalogIdempotencyConflictError(),
      new StaleWriteConflictError(),
      new ProductStatusGuardError(),
      new ProposalReviewError("AI_PROPOSAL_INTEGRITY_ERROR"),
      new ProposalApplyError("AI_PROPOSAL_APPLY_INTEGRITY_ERROR"),
    ]) {
      expect(classifyApplyFailure(error).status).toBe("FAILED_TERMINAL");
    }
  });

  it("classifies unknown operational ambiguity as retryable without leaking its message", () => {
    const classified = classifyApplyFailure(
      new Error("SELECT secret FROM private_table WHERE token='sensitive'")
    );
    expect(classified.status).toBe("FAILED_RETRYABLE");
    expect(classified.code).toBe("APPLY_OPERATION_RETRYABLE");
    expect(classified.message).not.toContain("SELECT");
    expect(classified.message).not.toContain("sensitive");
  });

  it("rejects invalid variant counts and oversized step indexes", () => {
    expect(() =>
      buildRequiredApplySteps({ mode: "CREATE", includeProductUpdate: false, variantCount: 101 })
    ).toThrow(ProposalApplyError);
    expect(() => parseApplyStepKey("VARIANT_CREATE:100")).toThrow(ProposalApplyError);
  });
});
