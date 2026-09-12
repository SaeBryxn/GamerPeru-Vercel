import { describe, expect, it } from "vitest";
import {
  createCanonicalResearchRequestSemantics,
  createProviderRequestDigest,
  createResearchMutationDigest,
  createResearchRequestFingerprint,
} from "@/lib/ai/research/idempotency";
import {
  copyGenerationSchema,
  createResearchJobInputSchema,
  identityResolutionSchema,
  specificationExtractionSchema,
} from "@/lib/ai/research/schemas";
import { assertOriginalCopy } from "@/lib/ai/research/proposal-service";
import { IDENTITY_STATUSES } from "@/lib/ai/research/types";
import { assertProviderIdentityResolution } from "@/lib/ai/research/orchestrator";

const snapshot = {
  profileKey: "PRODUCT_RESEARCH_FAST",
  providerId: "018f0025-0000-7000-8000-000000000010",
  modelId: "gemini-2.5-flash",
  temperature: 0.2,
  maxTokens: 4096,
};

describe("Research validation and idempotency contracts", () => {
  it("keeps the exact frozen identity vocabulary", () => {
    expect(IDENTITY_STATUSES).toEqual([
      "PENDING",
      "EXACT_MATCH",
      "PROBABLE_MATCH",
      "AMBIGUOUS",
      "UNSUPPORTED_CATEGORY",
      "CONFLICTING_IDENTIFIERS",
      "MANUALLY_DISAMBIGUATED",
    ]);
    expect(() =>
      assertProviderIdentityResolution({
        status: "MANUALLY_DISAMBIGUATED",
        brandName: null,
        modelName: null,
        rationale: "Provider tried to perform a human-only transition.",
      })
    ).toThrow("Provider cannot perform manual disambiguation");
  });

  it("implements the exact actor-scoped digest without persisting the raw request ID", () => {
    const actor = "018f0025-0000-7000-8000-000000000001";
    const first = createResearchMutationDigest(actor, "raw-M");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(createResearchMutationDigest(actor, "raw-M"));
    expect(first).not.toBe(
      createResearchMutationDigest("018f0025-0000-7000-8000-000000000002", "raw-M")
    );
    expect(first).not.toBe(createResearchMutationDigest(actor, "raw-M-2"));
    expect(first).not.toContain("raw-M");
  });

  it("fingerprints ordered normalized semantics and the complete immutable snapshot", () => {
    const base = {
      jobType: "BATCH" as const,
      profileSnapshot: snapshot,
      items: [
        {
          query: "Mouse A",
          mode: "CREATE" as const,
          targetProductId: null,
          targetProductVersionSnapshot: null,
        },
        {
          query: "Mouse B",
          mode: "CREATE" as const,
          targetProductId: null,
          targetProductVersionSnapshot: null,
        },
      ],
    };
    const fingerprint = createResearchRequestFingerprint(base);
    expect(createCanonicalResearchRequestSemantics(base)).toEqual({
      jobType: "BATCH",
      orderedNormalizedItems: base.items,
      mode: "CREATE",
      targetProductId: null,
      profileSnapshot: snapshot,
    });
    expect(fingerprint).toBe(createResearchRequestFingerprint(base));
    expect(fingerprint).not.toBe(
      createResearchRequestFingerprint({ ...base, items: [...base.items].reverse() })
    );
    expect(fingerprint).not.toBe(
      createResearchRequestFingerprint({
        ...base,
        profileSnapshot: { ...snapshot, temperature: 0.3 },
      })
    );
    expect(
      createCanonicalResearchRequestSemantics({
        jobType: "SINGLE",
        profileSnapshot: snapshot,
        items: [
          {
            query: "Mouse A",
            mode: "ENRICH",
            targetProductId: "018f0025-0000-7000-8000-000000000030",
            targetProductVersionSnapshot: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    ).toMatchObject({
      mode: "ENRICH",
      targetProductId: "018f0025-0000-7000-8000-000000000030",
      orderedNormalizedItems: [
        expect.objectContaining({ targetProductVersionSnapshot: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    expect(fingerprint).toBe(
      createResearchRequestFingerprint({
        ...base,
        selectedProfileId: "018f0025-0000-7000-8000-000000000099",
      } as typeof base & { selectedProfileId: string })
    );
    expect(fingerprint).not.toBe(
      createResearchRequestFingerprint({
        jobType: "SINGLE",
        profileSnapshot: snapshot,
        items: [
          {
            query: "Mouse A",
            mode: "ENRICH",
            targetProductId: "018f0025-0000-7000-8000-000000000030",
            targetProductVersionSnapshot: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(createProviderRequestDigest({ b: 2, a: 1 })).toBe(
      createProviderRequestDigest({ a: 1, b: 2 })
    );
  });

  it("allows only SINGLE CREATE, BATCH CREATE, and SINGLE ENRICH semantics", () => {
    const singleCreate = createResearchJobInputSchema.parse({
      mutationRequestId: "M",
      selectedProfileId: snapshot.providerId,
      items: [{ query: "  Logitech   G Pro X  " }],
    });
    expect(singleCreate.items[0]!.query).toBe("Logitech G Pro X");
    expect(singleCreate.items[0]!.mode).toBe("CREATE");

    const singleEnrich = createResearchJobInputSchema.parse({
      mutationRequestId: "M",
      selectedProfileId: snapshot.providerId,
      items: [{ query: "Mouse", mode: "ENRICH", targetProductId: snapshot.providerId }],
    });
    expect(singleEnrich.items[0]).toEqual({
      query: "Mouse",
      mode: "ENRICH",
      targetProductId: snapshot.providerId,
    });

    for (const invalidItem of [
      { query: "A", mode: "CREATE", targetProductId: snapshot.providerId },
      { query: "A", mode: "ENRICH" },
    ]) {
      expect(() =>
        createResearchJobInputSchema.parse({
          mutationRequestId: "M",
          selectedProfileId: snapshot.providerId,
          items: [invalidItem],
        })
      ).toThrow("CREATE must not have a target; ENRICH requires a target product");
    }

    expect(() =>
      createResearchJobInputSchema.parse({
        mutationRequestId: "M",
        selectedProfileId: snapshot.providerId,
        items: [
          {
            query: "A",
            mode: "ENRICH",
            targetProductId: snapshot.providerId,
            targetProductVersionSnapshot: new Date(),
          },
        ],
      })
    ).toThrow();

    expect(() =>
      createResearchJobInputSchema.parse({
        mutationRequestId: "M",
        selectedProfileId: snapshot.providerId,
        items: [
          {
            query: "A",
            mode: "ENRICH",
            targetProductId: snapshot.providerId,
          },
          { query: "B" },
        ],
      })
    ).toThrow("Batch ENRICH");
  });

  it("rejects operational fields, invalid numeric/spec types, and provider authority", () => {
    expect(() =>
      identityResolutionSchema.parse({
        status: "EXACT_MATCH",
        brandName: "Brand",
        modelName: "Model",
        rationale: "Evidence",
        publish: true,
      })
    ).toThrow();
    expect(() =>
      specificationExtractionSchema.parse({
        specifications: [{ fieldPath: "weight", value: Number.NaN, sourceIndexes: [0] }],
        unmappedSpecifications: {},
        variants: [],
        mediaCandidates: [],
      })
    ).toThrow();
    for (const forbiddenPayload of [
      {
        specifications: [{ fieldPath: "sellPrice", value: 100, sourceIndexes: [0] }],
      },
      { specifications: [], unmappedSpecifications: { inventory: 20 } },
      { specifications: [], variants: [{ attributes: { stock: 20 } }] },
    ]) {
      expect(() =>
        specificationExtractionSchema.parse({
          unmappedSpecifications: {},
          variants: [],
          mediaCandidates: [],
          ...forbiddenPayload,
        })
      ).toThrow("Operational or commerce-authority fields are forbidden");
    }
    expect(() =>
      copyGenerationSchema.parse({
        name: "Mouse",
        subtitle: null,
        description: null,
        seoTitle: null,
        seoDescription: null,
        price: 100,
      })
    ).toThrow();
  });

  it("rejects obvious long verbatim marketing-copy carry-over", () => {
    const passage =
      "This gaming mouse delivers an exceptionally precise sensor with advanced wireless performance and comfortable ergonomic handling for competitive players everywhere today";
    expect(() =>
      assertOriginalCopy(
        {
          name: "Mouse",
          subtitle: null,
          description: passage,
          seoTitle: null,
          seoDescription: null,
        },
        [passage]
      )
    ).toThrow("AI_COPY_VERBATIM_EVIDENCE");
    expect(() =>
      assertOriginalCopy(
        {
          name: "Mouse",
          subtitle: "Precio S/ 199",
          description: null,
          seoTitle: null,
          seoDescription: null,
        },
        []
      )
    ).toThrow("AI_COPY_COMMERCE_AUTHORITY_FORBIDDEN");
  });
});
