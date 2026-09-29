import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { ProductStoryRenderer } from "@/components/product-story";
import type { ProductStoryDetail } from "@/lib/catalog/product-detail-types";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import type { StoryRelatedProductsReader } from "@/lib/catalog/story-related-products-reader";
import { getCachedStoryRelatedProducts } from "@/lib/catalog/cached-queries";
import * as getReaderModule from "@/lib/catalog/get-reader";

describe("ProductStoryRenderer — Core Architecture & Test Inventory", () => {
  const PRODUCT_NAME = "WLMOUSE Beast X Pro";
  const PRODUCT_ID = "018f0000-0000-7000-8000-000000000001";

  // Test A: Story Omission
  it("renders null and zero container markup when story is empty or has zero valid blocks", () => {
    const html1 = renderToStaticMarkup(
      <ProductStoryRenderer
        story={null as unknown as ProductStoryDetail}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );
    expect(html1).toBe("");

    const emptyStory: ProductStoryDetail = {
      productId: PRODUCT_ID,
      publishedRevisionId: "rev-1",
      revisionNumber: 1,
      publishedAt: new Date().toISOString(),
      blocks: [],
    };
    const html2 = renderToStaticMarkup(
      <ProductStoryRenderer
        story={emptyStory}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );
    expect(html2).toBe("");
  });

  // Test B: Strict block ordering preservation
  it("renders story blocks in exact validated array order", () => {
    const story: ProductStoryDetail = {
      productId: PRODUCT_ID,
      publishedRevisionId: "rev-1",
      revisionNumber: 1,
      publishedAt: new Date().toISOString(),
      blocks: [
        {
          blockId: "b01",
          type: "stat_highlight",
          order: 1,
          payload: {
            title: "Primera Sección",
            stats: [{ value: "39", unit: "g", label: "Peso" }],
          },
        },
        {
          blockId: "b02",
          type: "faq",
          order: 2,
          payload: {
            title: "Segunda Sección",
            items: [{ question: "¿Pregunta?", answer: "Respuesta" }],
          },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={story}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );

    const posFirst = html.indexOf("Primera Sección");
    const posSecond = html.indexOf("Segunda Sección");
    expect(posFirst).toBeGreaterThan(-1);
    expect(posSecond).toBeGreaterThan(-1);
    expect(posFirst).toBeLessThan(posSecond);
  });

  // Test C: All 13 canonical block types render without error
  it("renders all 13 canonical block types in a single story", () => {
    const relatedMap = new Map<string, ProductDiscoveryItem>([
      [
        "teclado-pro",
        {
          id: "prod-2",
          name: "Teclado Gamer Pro",
          slug: "teclado-pro",
          subtitle: "8000 Hz",
          brand: { name: "WLMOUSE", slug: "wlmouse" },
          category: { name: "Teclados", slug: "teclados" },
          primaryMedia: null,
          startingPriceCents: 59900,
        },
      ],
    ]);

    const story: ProductStoryDetail = {
      productId: PRODUCT_ID,
      publishedRevisionId: "rev-1",
      revisionNumber: 1,
      publishedAt: new Date().toISOString(),
      blocks: [
        {
          blockId: "b01",
          type: "hero_media",
          order: 1,
          payload: { headline: "Hero Headline", videoKey: "stories/hero.mp4" },
        },
        {
          blockId: "b02",
          type: "full_bleed_image",
          order: 2,
          payload: { mediaKey: "stories/full.png", caption: "Full Bleed" },
        },
        {
          blockId: "b03",
          type: "image_text",
          order: 3,
          payload: {
            headline: "Split Headline",
            body: "Split body",
            mediaKey: "stories/split.png",
            imagePosition: "left",
          },
        },
        {
          blockId: "b04",
          type: "stat_highlight",
          order: 4,
          payload: { stats: [{ value: "8000", unit: "Hz", label: "Polling" }] },
        },
        {
          blockId: "b05",
          type: "spec_feature",
          order: 5,
          payload: { title: "Feature Title", description: "Feature Desc", badge: "New" },
        },
        {
          blockId: "b06",
          type: "video",
          order: 6,
          payload: { videoKey: "stories/demo.mp4", title: "Video Title" },
        },
        {
          blockId: "b07",
          type: "gallery",
          order: 7,
          payload: {
            items: [
              { mediaKey: "stories/g1.png" },
              { mediaKey: "stories/g2.png" },
              { mediaKey: "stories/g3.png" },
            ],
          },
        },
        {
          blockId: "b08",
          type: "comparison",
          order: 8,
          payload: { headers: ["A", "B"], rows: [["1", "2"]] },
        },
        {
          blockId: "b09",
          type: "dimensions",
          order: 9,
          payload: { lengthMm: 120, widthMm: 60, heightMm: 38 },
        },
        {
          blockId: "b10",
          type: "box_contents",
          order: 10,
          payload: { items: [{ title: "Mouse", count: 1 }] },
        },
        {
          blockId: "b11",
          type: "technical_specs",
          order: 11,
          payload: {
            groups: [{ groupName: "General", specs: [{ label: "Sensor", value: "3950" }] }],
          },
        },
        {
          blockId: "b12",
          type: "faq",
          order: 12,
          payload: { items: [{ question: "¿Q?", answer: "A" }] },
        },
        {
          blockId: "b13",
          type: "related_products",
          order: 13,
          payload: { productSlugs: ["teclado-pro"] },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={story}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
        relatedProductsMap={relatedMap}
      />
    );

    expect(html).toContain("story-hero-media-block");
    expect(html).toContain("story-full-bleed-image-block");
    expect(html).toContain("story-image-text-block");
    expect(html).toContain("story-stat-highlight-block");
    expect(html).toContain("story-spec-feature-block");
    expect(html).toContain("story-video-block");
    expect(html).toContain("story-gallery-block");
    expect(html).toContain("story-comparison-block");
    expect(html).toContain("story-dimensions-block");
    expect(html).toContain("story-box-contents-block");
    expect(html).toContain("story-technical-specs-block");
    expect(html).toContain("story-faq-block");
    expect(html).toContain("story-related-products-block");

    // Image-led blocks sit in the full-width frame; every other block in the centered one.
    const frameOf = (testId: string) =>
      html.match(new RegExp(`<div class="([^"]*)"><[a-z]+[^>]*data-testid="${testId}"`))?.[1] ?? "";
    for (const testId of [
      "story-hero-media-block",
      "story-full-bleed-image-block",
      "story-gallery-block",
    ]) {
      expect(frameOf(testId), testId).toMatch(/fullWidthFrame/);
    }
    for (const testId of ["story-image-text-block", "story-faq-block", "story-comparison-block"]) {
      expect(frameOf(testId), testId).toMatch(/blockFrame/);
    }
  });

  // Test AJ & AK: No raw HTML and correct heading hierarchy
  it("does not render dangerouslySetInnerHTML or duplicate h1 elements", () => {
    const story: ProductStoryDetail = {
      productId: PRODUCT_ID,
      publishedRevisionId: "rev-1",
      revisionNumber: 1,
      publishedAt: new Date().toISOString(),
      blocks: [
        {
          blockId: "b01",
          type: "hero_media",
          order: 1,
          payload: { headline: "Historia del Producto" },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={story}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );

    // No h1 in story renderer (DB3B Commerce Hero owns single PDP h1)
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
  });
});

describe("GP-014 DB3C Execution Amendments Regression Tests", () => {
  const PRODUCT_NAME = "WLMOUSE Beast X Pro";
  const PRODUCT_ID = "018f0000-0000-7000-8000-000000000001";

  // AMENDMENT TEST A: Hero static fallback layering (video + poster + media)
  it("AMENDMENT A: establishes static poster fallback underneath ambient video", () => {
    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={{
          productId: PRODUCT_ID,
          publishedRevisionId: "rev-1",
          revisionNumber: 1,
          publishedAt: new Date().toISOString(),
          blocks: [
            {
              blockId: "b01",
              type: "hero_media",
              order: 1,
              payload: {
                headline: "Hero Con Video y Poster",
                videoKey: "stories/hero.mp4",
                posterKey: "stories/poster.png",
                mediaKey: "stories/media.png",
              },
            },
          ],
        }}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );

    expect(html).toContain("<video");
    expect(html).toContain("<img");
    expect(html).toContain("stories/poster.png");
  });

  // AMENDMENT TEST B: Hero static fallback layering (video + media, poster absent)
  it("AMENDMENT B: uses mediaKey as static fallback when poster is absent", () => {
    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={{
          productId: PRODUCT_ID,
          publishedRevisionId: "rev-1",
          revisionNumber: 1,
          publishedAt: new Date().toISOString(),
          blocks: [
            {
              blockId: "b01",
              type: "hero_media",
              order: 1,
              payload: {
                headline: "Hero Con Video y Media Fallback",
                videoKey: "stories/hero.mp4",
                mediaKey: "stories/media.png",
              },
            },
          ],
        }}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );

    expect(html).toContain("<video");
    expect(html).toContain("<img");
    expect(html).toContain("stories%2Fmedia.png");
  });

  // AMENDMENT TEST D: Content Video loop, muted, playsInline, preload="metadata"
  it("AMENDMENT D: Content video explicitly includes loop, muted, playsInline, and preload metadata", () => {
    const html = renderToStaticMarkup(
      <ProductStoryRenderer
        story={{
          productId: PRODUCT_ID,
          publishedRevisionId: "rev-1",
          revisionNumber: 1,
          publishedAt: new Date().toISOString(),
          blocks: [
            {
              blockId: "b06",
              type: "video",
              order: 1,
              payload: {
                videoKey: "stories/demo.mp4",
                title: "Looping Demo",
              },
            },
          ],
        }}
        currentProductId={PRODUCT_ID}
        productName={PRODUCT_NAME}
      />
    );

    expect(html).toContain("<video");
    expect(html).toContain("loop");
    expect(html).toContain("muted");
    expect(html.toLowerCase()).toContain("playsinline");
    expect(html).toContain('preload="metadata"');
  });

  // AMENDMENT TEST F: RelatedProducts reader failure isolation
  it("AMENDMENT F: catches reader failure, returns [], and avoids 500 on PDP Story", async () => {
    // Mock getStoryRelatedProductsReader throwing an error
    const mockReader: StoryRelatedProductsReader = {
      getPublishedProductsBySlugs: vi.fn().mockRejectedValue(new Error("Connection refused")),
    };
    vi.spyOn(getReaderModule, "getStoryRelatedProductsReader").mockReturnValue(mockReader);

    const result = await getCachedStoryRelatedProducts(["mouse-pro-1"], "prod-curr");
    expect(result).toEqual([]);

    vi.restoreAllMocks();
  });

  // AMENDMENT TEST G: Zero productSlugs executes 0 queries
  it("AMENDMENT G: does not invoke reader when slugs list is empty", async () => {
    const mockReader: StoryRelatedProductsReader = {
      getPublishedProductsBySlugs: vi.fn(),
    };
    vi.spyOn(getReaderModule, "getStoryRelatedProductsReader").mockReturnValue(mockReader);

    const result = await getCachedStoryRelatedProducts([], "prod-curr");
    expect(result).toEqual([]);
    expect(mockReader.getPublishedProductsBySlugs).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
