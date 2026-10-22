import { describe, expect, it, vi } from "vitest";
import { specificationExtractionSchema, storePageReviewFields } from "@/lib/ai/research/schemas";
import { assertSpecificationEvidence } from "@/lib/ai/research/orchestrator";
import type { ExternalProductEvidence } from "@/lib/ai/research/types";

vi.mock("@/db", () => ({ db: {} }));

const evidence: ExternalProductEvidence[] = [
  {
    originalUrl: "https://manufacturer.example/manual",
    resolvedUrl: "https://manufacturer.example/manual",
    title: "Manual",
    text: "Medidas oficiales",
    snippet: "Medidas",
    contentSha256: "a".repeat(64),
    retrievalMethod: "DIRECT_URL",
    trustTier: "TIER_1_OFFICIAL_MANUFACTURER",
    trustBasis: "CANONICAL_BRAND_DOMAIN_MATCH",
    fetchedAt: new Date(),
  },
];
const parse = (storePage: unknown) =>
  specificationExtractionSchema.parse({ specifications: [], storePage });

describe("investigación de los bloques de la tienda", () => {
  it("mantiene compatibles las respuestas anteriores y exige fuentes en cada dato", () => {
    expect(specificationExtractionSchema.parse({ specifications: [] }).storePage).toBeUndefined();
    expect(() => parse({ sizes: [{ name: "Mini", weight: "45 g" }] })).toThrow();
    expect(() => parse({ support: { warranty: { value: "2 años" } } })).toThrow();
    expect(() =>
      parse({
        packageContents: [{ edition: "Mini", sourceIndexes: [0], items: [{ name: "Cable" }] }],
      })
    ).toThrow();
    expect(() => parse({ stock: 10 })).toThrow();
    expect(() =>
      parse({ sizes: [{ name: "Mini", handMin: 20, handMax: 18, sourceIndexes: [0] }] })
    ).toThrow();
  });

  it("proyecta bloques legibles sin perder las fuentes específicas de los elementos", () => {
    const extraction = parse({
      sizes: [
        {
          name: "Mini",
          lengthMm: 110,
          widthMm: 60,
          heightMm: 36,
          weight: "45 g",
          sourceIndexes: [0],
        },
      ],
      packageContents: [
        {
          edition: "Mini",
          sourceIndexes: [0],
          items: [{ name: "Cable", quantity: "1", sourceIndexes: [1] }],
        },
      ],
      support: { warranty: { value: "2 años", sourceIndexes: [0] } },
      highlights: [{ label: "Sensor", value: "Sensor de prueba", sourceIndexes: [0] }],
    });
    expect(storePageReviewFields(extraction.storePage)).toContainEqual({
      fieldPath: "pdp.packageContents",
      proposedValue: [{ edition: "Mini", items: [{ name: "Cable", quantity: "1" }] }],
      sourceIndexes: [0, 1],
    });
    expect(storePageReviewFields(extraction.storePage)).toContainEqual({
      fieldPath: "pdp.support.warranty",
      proposedValue: "2 años",
      sourceIndexes: [0],
    });
  });

  it("rechaza índices inexistentes incluso en caja y enlaces de soporte", () => {
    for (const page of [
      { sizes: [{ name: "Mini", sourceIndexes: [1] }] },
      {
        packageContents: [
          { edition: "Mini", sourceIndexes: [0], items: [{ name: "Cable", sourceIndexes: [1] }] },
        ],
      },
      { support: { warranty: { value: "2 años", sourceIndexes: [1] } } },
      { highlights: [{ label: "DPI", value: "1000", sourceIndexes: [1] }] },
    ])
      expect(() => assertSpecificationEvidence(parse(page), evidence)).toThrow("source provenance");
  });

  it.each(["manualUrl", "driverUrl"])(
    "admite %s solo si su URL pertenece a la evidencia",
    (key) => {
      expect(() =>
        assertSpecificationEvidence(
          parse({ support: { [key]: { value: evidence[0]!.resolvedUrl, sourceIndexes: [0] } } }),
          evidence
        )
      ).not.toThrow();
      expect(() =>
        assertSpecificationEvidence(
          parse({
            support: { [key]: { value: "https://invented.example/download", sourceIndexes: [0] } },
          }),
          evidence
        )
      ).toThrow("unexpected URL");
    }
  );

  it("exige fuentes oficiales para los rangos de mano y no los inventa al faltar", () => {
    const value = parse({
      sizes: [{ name: "Mini", handMin: 16, handMax: 18, sourceIndexes: [0] }],
    });
    expect(() => assertSpecificationEvidence(value, evidence)).not.toThrow();
    expect(() =>
      assertSpecificationEvidence(value, [
        { ...evidence[0]!, trustTier: "TIER_5_REPUTABLE_SECONDARY" },
      ])
    ).toThrow("official source");
    expect(
      parse({ sizes: [{ name: "Mini", weight: "45 g", sourceIndexes: [0] }] }).storePage?.sizes?.[0]
    ).not.toHaveProperty("handMin");
  });
});
