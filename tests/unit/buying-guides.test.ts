import { describe, expect, it, vi } from "vitest";
import { BUYING_GUIDES, getBuyingGuide, type GuideCriterion } from "@/content/guides";
import { buildGuideStructuredData } from "@/lib/guides/guide-seo";
import { buildGuideOptionState, resolveGuideCriteria } from "@/lib/guides/resolve-guide-options";
import type {
  DiscoveryFilterState,
  ValidatedSpecificationField,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";

function field(overrides: Partial<ValidatedSpecificationField>): ValidatedSpecificationField {
  return {
    key: "key",
    label: "Label",
    dataType: "number",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "param",
    displayOrder: 0,
    ...overrides,
  };
}

/** Mirrors the production mouse schema (scripts/seed-spec-schemas.mjs). */
const MOUSE_SCHEMA: ValidatedSpecificationSchema = {
  id: "schema-mouses",
  categoryId: "cat-mouses",
  schemaVersion: 1,
  fieldDefinitions: [
    field({ key: "polling", publicParam: "polling", min: 125, max: 8000, step: 1 }),
    field({ key: "peso", publicParam: "peso", min: 20, max: 200, step: 0.1 }),
    field({
      key: "forma",
      publicParam: "forma",
      dataType: "enum",
      filterKind: "ENUM_MULTI",
      options: [
        { value: "simetrico", label: "Simétrico" },
        { value: "ergonomico", label: "Ergonómico" },
      ],
    }),
  ],
};

const CRITERIA: GuideCriterion[] = [
  {
    id: "peso",
    title: "Peso",
    why: ["Por qué importa."],
    options: [
      {
        id: "ligero",
        label: "Ligero",
        description: "",
        filter: { peso_min: "55", peso_max: "70" },
      },
      { id: "pesado", label: "Pesado", description: "", filter: { peso_min: "90" } },
    ],
  },
  {
    id: "bateria",
    title: "Batería",
    why: ["Por qué importa."],
    options: [{ id: "larga", label: "Larga", description: "", filter: { bateria_min: "100" } }],
  },
];

describe("Buying guide options", () => {
  it("builds a filter state when the schema supports every parameter", () => {
    const state = buildGuideOptionState(CRITERIA[0]!.options[0]!, MOUSE_SCHEMA);
    expect(state?.technical).toEqual({ peso: { min: 55, max: 70 } });
  });

  it("rejects options whose parameters the schema does not define", () => {
    expect(buildGuideOptionState(CRITERIA[1]!.options[0]!, MOUSE_SCHEMA)).toBeNull();
    expect(
      buildGuideOptionState(
        {
          id: "mix",
          label: "",
          description: "",
          filter: { forma: "simetrico", bateria_min: "60" },
        },
        MOUSE_SCHEMA
      )
    ).toBeNull();
    expect(buildGuideOptionState(CRITERIA[0]!.options[0]!, null)).toBeNull();
  });

  it("rejects enum values the schema does not list", () => {
    expect(
      buildGuideOptionState(
        { id: "x", label: "", description: "", filter: { forma: "vertical" } },
        MOUSE_SCHEMA
      )
    ).toBeNull();
  });

  it("counts each option, hides empty ones and links the canonical filtered URL", async () => {
    const count = vi.fn(async (state: DiscoveryFilterState) => {
      const peso = state.technical.peso as { min?: number } | undefined;
      return peso?.min === 55 ? 3 : 0;
    });

    const [peso, bateria] = await resolveGuideCriteria(CRITERIA, "mouses", MOUSE_SCHEMA, count);

    expect(peso!.options).toHaveLength(1);
    expect(peso!.options[0]).toMatchObject({
      id: "ligero",
      count: 3,
      href: "/categorias/mouses?peso_max=70&peso_min=55",
    });
    expect(bateria!.options).toEqual([]);
    expect(bateria!.why).toEqual(["Por qué importa."]);
    expect(count).toHaveBeenCalledTimes(2);
  });
});

describe("Buying guide content", () => {
  it("covers the three menu guides", () => {
    expect(BUYING_GUIDES.map((guide) => guide.slug).sort()).toEqual([
      "mousepads",
      "mouses",
      "teclados",
    ]);
    expect(getBuyingGuide("no-existe")).toBeUndefined();
  });

  it.each(BUYING_GUIDES)("$slug has unique ids, criteria with options and an FAQ", (guide) => {
    const criterionIds = guide.criteria.map((criterion) => criterion.id);
    expect(new Set(criterionIds).size).toBe(criterionIds.length);
    for (const criterion of guide.criteria) {
      expect(criterion.why.length).toBeGreaterThan(0);
      const optionIds = criterion.options.map((option) => option.id);
      expect(optionIds.length).toBeGreaterThan(0);
      expect(new Set(optionIds).size).toBe(optionIds.length);
    }
    expect(guide.faq.items.length).toBeGreaterThan(0);
    expect(guide.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it("emits Article, BreadcrumbList and FAQPage structured data", () => {
    const data = buildGuideStructuredData(getBuyingGuide("mouses")!);
    const graph = data["@graph"] as { "@type": string; url?: string }[];
    expect(graph.map((node) => node["@type"])).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
    expect(graph[0]!.url).toBe("https://gamerperu.com/guia-de-compra/mouses");
  });
});
