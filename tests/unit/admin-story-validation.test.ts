import { describe, expect, it } from "vitest";
import {
  StoryValidationError,
  validateAuthoringStoryDocument,
  validatePersistedStoryDocument,
} from "@/lib/admin/catalog/story-validation";

const IMAGE_ID = "018f0026-0000-7000-8000-000000000001";
const VIDEO_ID = "018f0026-0000-7000-8000-000000000002";
const RELATED_ID = "018f0026-0000-7000-8000-000000000003";

function allBlockTypes() {
  return [
    {
      blockId: "hero",
      type: "hero_media",
      payload: {
        headline: " Rendimiento principal ",
        tagline: "Precisión competitiva",
        mediaId: IMAGE_ID,
        videoMediaId: VIDEO_ID,
      },
    },
    {
      blockId: "full",
      type: "full_bleed_image",
      payload: { mediaId: IMAGE_ID, altText: "Vista completa" },
    },
    {
      blockId: "image-text",
      type: "image_text",
      payload: {
        headline: "Control",
        body: "Respuesta precisa",
        mediaId: IMAGE_ID,
        imagePosition: "right",
      },
    },
    {
      blockId: "stats",
      type: "stat_highlight",
      payload: { stats: [{ value: "8000", unit: "Hz", label: "Sondeo" }] },
    },
    {
      blockId: "feature",
      type: "spec_feature",
      payload: { title: "Sensor", description: "Seguimiento uniforme", mediaId: IMAGE_ID },
    },
    {
      blockId: "video",
      type: "video",
      payload: { videoMediaId: VIDEO_ID, posterMediaId: IMAGE_ID, title: "Demostración" },
    },
    {
      blockId: "gallery",
      type: "gallery",
      payload: {
        items: [{ mediaId: IMAGE_ID }, { mediaId: IMAGE_ID }, { mediaId: IMAGE_ID }],
      },
    },
    {
      blockId: "comparison",
      type: "comparison",
      payload: { headers: ["Modelo", "Peso"], rows: [["GP One", "52 g"]] },
    },
    {
      blockId: "dimensions",
      type: "dimensions",
      payload: { blueprintMediaId: IMAGE_ID, lengthMm: 120, gripTypes: ["Garra"] },
    },
    {
      blockId: "box",
      type: "box_contents",
      payload: { items: [{ title: "Mouse", mediaId: IMAGE_ID, count: 1 }] },
    },
    {
      blockId: "technical",
      type: "technical_specs",
      payload: {
        groups: [{ groupName: "Sensor", specs: [{ label: "Modelo", value: "PAW3950" }] }],
      },
    },
    {
      blockId: "faq",
      type: "faq",
      payload: { items: [{ question: "¿Incluye cable?", answer: "Sí, incluye cable USB." }] },
    },
    {
      blockId: "related",
      type: "related_products",
      payload: { productIds: [RELATED_ID] },
    },
  ];
}

describe("GP-026 CHK1 strict Story authoring validation", () => {
  it("accepts exactly the 13 frozen block types and trims boundary whitespace", () => {
    const result = validateAuthoringStoryDocument(allBlockTypes(), { allowEmpty: true });

    expect(result).toHaveLength(13);
    expect(result.map((block) => block.type)).toEqual([
      "hero_media",
      "full_bleed_image",
      "image_text",
      "stat_highlight",
      "spec_feature",
      "video",
      "gallery",
      "comparison",
      "dimensions",
      "box_contents",
      "technical_specs",
      "faq",
      "related_products",
    ]);
    expect(result[0]?.payload).toMatchObject({ headline: "Rendimiento principal" });
  });

  it("rejects unknown block types, envelope keys, payload keys, and caller-authored order", () => {
    for (const document of [
      [{ blockId: "x", type: "custom", payload: {} }],
      [{ blockId: "x", type: "hero_media", payload: { headline: "Válido" }, extra: true }],
      [{ blockId: "x", type: "hero_media", payload: { headline: "Válido", html: "no" } }],
      [{ blockId: "x", type: "hero_media", order: 99, payload: { headline: "Válido" } }],
    ]) {
      expect(() => validateAuthoringStoryDocument(document, { allowEmpty: true })).toThrow(
        StoryValidationError
      );
    }
  });

  it("enforces exact text and nested collection bounds", () => {
    const exactHeadline = [
      { blockId: "x", type: "hero_media", payload: { headline: "a".repeat(200) } },
    ];
    expect(validateAuthoringStoryDocument(exactHeadline, { allowEmpty: true })).toHaveLength(1);

    expect(() =>
      validateAuthoringStoryDocument(
        [{ blockId: "x", type: "hero_media", payload: { headline: "a".repeat(201) } }],
        { allowEmpty: true }
      )
    ).toThrow(StoryValidationError);
    expect(() =>
      validateAuthoringStoryDocument(
        [{ blockId: "gallery", type: "gallery", payload: { items: [{ mediaId: IMAGE_ID }] } }],
        { allowEmpty: true }
      )
    ).toThrow(StoryValidationError);
  });

  it("rejects required whitespace, HTML, Markdown, and executable-looking content", () => {
    for (const headline of ["   ", "<strong>Texto</strong>", "**Texto**", "javascript:alert(1)"]) {
      expect(() =>
        validateAuthoringStoryDocument(
          [{ blockId: "x", type: "hero_media", payload: { headline } }],
          { allowEmpty: true }
        )
      ).toThrow(StoryValidationError);
    }
  });

  it("rejects duplicate block IDs and duplicate related Product identities", () => {
    expect(() =>
      validateAuthoringStoryDocument(
        [
          { blockId: "same", type: "hero_media", payload: { headline: "Uno" } },
          { blockId: " same ", type: "hero_media", payload: { headline: "Dos" } },
        ],
        { allowEmpty: true }
      )
    ).toThrowError(expect.objectContaining({ code: "STORY_VALIDATION_ERROR" }));

    expect(() =>
      validateAuthoringStoryDocument(
        [
          {
            blockId: "related",
            type: "related_products",
            payload: { productIds: [RELATED_ID, RELATED_ID] },
          },
        ],
        { allowEmpty: true }
      )
    ).toThrow(StoryValidationError);
  });

  it("accepts 30 blocks, rejects 31, and preserves document array order", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => ({
      blockId: `block-${index}`,
      type: "hero_media",
      payload: { headline: `Bloque ${index}` },
    }));
    expect(
      validateAuthoringStoryDocument(thirty, { allowEmpty: true }).map((b) => b.blockId)
    ).toEqual(thirty.map((b) => b.blockId));
    expect(() =>
      validateAuthoringStoryDocument(
        [...thirty, { blockId: "block-31", type: "hero_media", payload: { headline: "31" } }],
        { allowEmpty: true }
      )
    ).toThrow(StoryValidationError);
  });

  it("rejects comparison rows whose width differs from the header width", () => {
    expect(() =>
      validateAuthoringStoryDocument(
        [
          {
            blockId: "compare",
            type: "comparison",
            payload: { headers: ["A", "B", "C"], rows: [["1", "2"]] },
          },
        ],
        { allowEmpty: true }
      )
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "blocks[0].payload.rows[0]" }),
        ]),
      })
    );
  });

  it("allows an empty draft and rejects an empty publication document", () => {
    expect(validateAuthoringStoryDocument([], { allowEmpty: true })).toEqual([]);
    expect(() => validateAuthoringStoryDocument([], { allowEmpty: false })).toThrowError(
      expect.objectContaining({
        issues: [{ code: "EMPTY_STORY", path: "blocks", message: expect.any(String) }],
      })
    );
  });

  it("rejects non-contiguous persisted order and accepts exact contiguous order", () => {
    const persisted = [
      { block_id: "a", type: "hero_media", order: 1, payload: { headline: "Uno" } },
      { block_id: "b", type: "hero_media", order: 2, payload: { headline: "Dos" } },
    ];
    expect(validatePersistedStoryDocument(persisted, { allowEmpty: false })).toHaveLength(2);
    expect(() =>
      validatePersistedStoryDocument([persisted[0], { ...persisted[1], order: 3 }], {
        allowEmpty: false,
      })
    ).toThrowError(
      expect.objectContaining({
        issues: [expect.objectContaining({ code: "INVALID_BLOCK_ORDER" })],
      })
    );
  });
});
