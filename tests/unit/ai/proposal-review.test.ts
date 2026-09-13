import { describe, expect, it } from "vitest";
import {
  classifyProposalFieldPath,
  computeProposalReviewCounts,
  humanVariantPlanInputSchema,
  isCanonicalVariantPlan,
  isSameTerminalDecision,
  normalizeHumanVariantPlan,
  normalizeProposalName,
  normalizeProposalSlug,
  proposalFieldDecisionInputSchema,
  proposalVersionInputSchema,
  validateSourceResolutionSemantics,
} from "@/lib/ai/proposals/schemas";
import { ProposalReviewError } from "@/lib/ai/proposals/types";

const proposalId = "018f0025-3000-7000-8000-000000000001";
const expectedProposalUpdatedAt = "2026-09-12T12:00:00.000Z";

describe("GP-025 / CHK3-B proposal review contracts", () => {
  it("accepts only a UUID and exact timestamp at the version boundary", () => {
    expect(proposalVersionInputSchema.parse({ proposalId, expectedProposalUpdatedAt })).toEqual({
      proposalId,
      expectedProposalUpdatedAt,
    });
    expect(() =>
      proposalVersionInputSchema.parse({ proposalId: "bad", expectedProposalUpdatedAt })
    ).toThrow();
    expect(() =>
      proposalVersionInputSchema.parse({ proposalId, expectedProposalUpdatedAt: "yesterday" })
    ).toThrow();
  });

  it("strips caller-supplied authority fields from public decision input", () => {
    const parsed = proposalFieldDecisionInputSchema.parse({
      proposalId,
      expectedProposalUpdatedAt,
      fieldPath: "copy.name",
      decision: "ACCEPTED",
      actorId: "attacker",
      authUserId: "attacker",
      role: "SUPER_ADMIN",
      permissions: ["catalog:ai_research"],
    });
    expect(parsed).not.toHaveProperty("actorId");
    expect(parsed).not.toHaveProperty("authUserId");
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("permissions");
  });

  it.each(["PENDING", "ACCEPTED", "REJECTED", "MANUALLY_EDITED"])(
    "accepts the %s field decision",
    (decision) => {
      expect(
        proposalFieldDecisionInputSchema.parse({
          proposalId,
          expectedProposalUpdatedAt,
          fieldPath: "copy.name",
          decision,
        }).decision
      ).toBe(decision);
    }
  );

  it("rejects non-canonical decisions and overlong field paths", () => {
    expect(() =>
      proposalFieldDecisionInputSchema.parse({
        proposalId,
        expectedProposalUpdatedAt,
        fieldPath: "copy.name",
        decision: "APPROVED",
      })
    ).toThrow();
    expect(() =>
      proposalFieldDecisionInputSchema.parse({
        proposalId,
        expectedProposalUpdatedAt,
        fieldPath: "x".repeat(101),
        decision: "REJECTED",
      })
    ).toThrow();
  });

  it("normalizes human slugs without mutating stored proposal values", () => {
    expect(normalizeProposalSlug("  Mouse-Pro-2  ")).toBe("mouse-pro-2");
  });

  it.each(["", "a b", "-leading", "trailing-", "a--b", "a".repeat(201)])(
    "rejects invalid slug %j",
    (slug) => {
      expect(() => normalizeProposalSlug(slug)).toThrowError(
        expect.objectContaining({ code: "AI_PROPOSAL_INVALID_SLUG" })
      );
    }
  );

  it("trims a valid product name and enforces its canonical bound", () => {
    expect(normalizeProposalName("  Mouse Pro  ")).toBe("Mouse Pro");
    expect(() => normalizeProposalName(" ")).toThrowError(
      expect.objectContaining({ code: "AI_PROPOSAL_INVALID_NAME" })
    );
    expect(() => normalizeProposalName("x".repeat(201))).toThrow(ProposalReviewError);
  });

  it("normalizes PEN strings into an exact, deterministic variant plan", () => {
    expect(
      normalizeHumanVariantPlan([
        {
          sku: " GP-MOUSE-BLACK ",
          title: " Black ",
          pricePen: "S/ 129.90",
          compareAtPricePen: "149.9",
          costPen: "90",
          weightGrams: 54,
          attributes: { color: "black" },
        },
        {
          sku: "GP-MOUSE-WHITE",
          title: "White",
          pricePen: "130",
        },
      ])
    ).toEqual([
      {
        sku: "GP-MOUSE-BLACK",
        title: "Black",
        priceCents: 12_990,
        compareAtPriceCents: 14_990,
        costCents: 9_000,
        weightGrams: 54,
        attributes: { color: "black" },
        displayOrder: 0,
      },
      {
        sku: "GP-MOUSE-WHITE",
        title: "White",
        priceCents: 13_000,
        compareAtPriceCents: null,
        costCents: null,
        weightGrams: null,
        attributes: {},
        displayOrder: 1,
      },
    ]);
  });

  it.each(["129,90", "1.999", "-1", "", "S/", "NaN", "21474836.48"])(
    "rejects non-canonical price input %j",
    (pricePen) => {
      expect(() =>
        normalizeHumanVariantPlan([{ sku: "SKU", title: "Title", pricePen }])
      ).toThrowError(expect.objectContaining({ code: "AI_PROPOSAL_INVALID_VARIANT_PLAN" }));
    }
  );

  it("rejects duplicate, blank and overlong SKUs", () => {
    expect(() =>
      normalizeHumanVariantPlan([
        { sku: "SKU", title: "One", pricePen: "1" },
        { sku: "SKU", title: "Two", pricePen: "2" },
      ])
    ).toThrowError(expect.objectContaining({ code: "AI_PROPOSAL_INVALID_VARIANT_PLAN" }));
    expect(() =>
      normalizeHumanVariantPlan([{ sku: " ", title: "Title", pricePen: "1" }])
    ).toThrow();
    expect(() =>
      normalizeHumanVariantPlan([{ sku: "x".repeat(51), title: "Title", pricePen: "1" }])
    ).toThrow();
  });

  it("rejects blank and overlong variant titles", () => {
    expect(() => normalizeHumanVariantPlan([{ sku: "SKU", title: " ", pricePen: "1" }])).toThrow();
    expect(() =>
      normalizeHumanVariantPlan([{ sku: "SKU", title: "x".repeat(151), pricePen: "1" }])
    ).toThrow();
  });

  it("rejects invalid optional cents and int32-overflow weight", () => {
    expect(() =>
      normalizeHumanVariantPlan([
        { sku: "SKU", title: "Title", pricePen: "1", costPen: "21474836.48" },
      ])
    ).toThrow();
    expect(() =>
      humanVariantPlanInputSchema.parse({
        proposalId,
        expectedProposalUpdatedAt,
        variants: [{ sku: "SKU", title: "Title", pricePen: "1", weightGrams: 2_147_483_648 }],
      })
    ).toThrow();
  });

  it("rejects empty variant plans at the dedicated boundary", () => {
    expect(() =>
      humanVariantPlanInputSchema.parse({
        proposalId,
        expectedProposalUpdatedAt,
        variants: [],
      })
    ).toThrow();
  });

  it("recognizes only the exact persisted variant shape", () => {
    const plan = normalizeHumanVariantPlan([
      { sku: "SKU", title: "Title", pricePen: "0.01", attributes: { color: "black" } },
    ]);
    expect(isCanonicalVariantPlan(plan)).toBe(true);
    expect(isCanonicalVariantPlan([{ ...plan[0], pricePen: "0.01" }])).toBe(false);
    expect(isCanonicalVariantPlan([{ ...plan[0], priceCents: 0 }])).toBe(false);
    expect(isCanonicalVariantPlan([{ ...plan[0], displayOrder: 1 }])).toBe(false);
    expect(isCanonicalVariantPlan([{ ...plan[0], attributes: { color: 1 } }])).toBe(false);
  });

  it("classifies canonical, reserved and direct specification field paths", () => {
    expect(classifyProposalFieldPath("catalog.brandId")).toBe("CATALOG");
    expect(classifyProposalFieldPath("copy.name")).toBe("COPY");
    expect(classifyProposalFieldPath("seo.title")).toBe("SEO");
    expect(classifyProposalFieldPath("research.variants")).toBe("RESEARCH");
    expect(classifyProposalFieldPath("copy.unknown")).toBe("RESERVED");
    expect(classifyProposalFieldPath("weight_g")).toBe("SPECIFICATION");
  });

  it("counts accepted/manual fields as approved and exclusions as rejected", () => {
    expect(
      computeProposalReviewCounts([
        { decision: "ACCEPTED" },
        { decision: "MANUALLY_EDITED" },
        { decision: "REJECTED" },
        { decision: "PENDING" },
      ])
    ).toEqual({ approvedFieldsCount: 2, rejectedFieldsCount: 1 });
  });

  it("recognizes only an identical terminal intent as a replay candidate", () => {
    expect(isSameTerminalDecision("APPROVED", "APPROVED")).toBe(true);
    expect(isSameTerminalDecision("REJECTED", "REJECTED")).toBe(true);
    expect(isSameTerminalDecision("APPROVED", "REJECTED")).toBe(false);
    expect(isSameTerminalDecision("DRAFT", "APPROVED")).toBe(false);
  });

  it("validates supporting-source and conflict-source decision semantics", () => {
    expect(() =>
      validateSourceResolutionSemantics({
        decision: "ACCEPTED",
        verificationState: "AI_INFERRED",
        selectedValue: { weight: 54 },
        preferredSource: { relationship: "SUPPORTS", sourceValue: { weight: 54 } },
      })
    ).not.toThrow();
    expect(() =>
      validateSourceResolutionSemantics({
        decision: "ACCEPTED",
        verificationState: "SOURCE_CONFLICT",
        selectedValue: 54,
        preferredSource: null,
      })
    ).toThrowError(expect.objectContaining({ code: "AI_PROPOSAL_UNRESOLVED_CONFLICT" }));
    expect(() =>
      validateSourceResolutionSemantics({
        decision: "MANUALLY_EDITED",
        verificationState: "SOURCE_CONFLICT",
        selectedValue: 55,
        preferredSource: { relationship: "CONFLICTS", sourceValue: 55 },
      })
    ).not.toThrow();
    expect(() =>
      validateSourceResolutionSemantics({
        decision: "REJECTED",
        verificationState: "SOURCE_CONFLICT",
        selectedValue: null,
        preferredSource: { relationship: "SUPPORTS", sourceValue: 54 },
      })
    ).toThrowError(expect.objectContaining({ code: "AI_PROPOSAL_INVALID_PREFERRED_SOURCE" }));
  });
});
