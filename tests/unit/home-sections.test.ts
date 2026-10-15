import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import {
  CommunityBannerContentSchema,
  FeatureVideoContentSchema,
  SplitShowcaseContentSchema,
  VideoHeroContentSchema,
  listHomeSectionMediaSlots,
  parseHomeSectionContent,
  type HomeSection,
} from "@/lib/home/section-schemas";
import type { StoredHome } from "@/lib/home/read-home-sections";

const readerModeMock = vi.hoisted(() => ({ value: "postgres" }));
const dbMock = vi.hoisted(() => ({ results: [] as unknown[], fail: false }));

vi.mock("@/lib/catalog/resolve-reader-mode", () => ({
  resolveCatalogReaderMode: () => readerModeMock.value,
}));

vi.mock("@/lib/media/resolve-public-media-url", () => ({
  resolvePublicMediaUrl: (key: string) => `https://cdn.test/${key}`,
}));

vi.mock("@/db", () => {
  const chain = (): unknown => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "orderBy", "innerJoin", "where"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      dbMock.fail
        ? Promise.reject(new Error("db down")).then(resolve, reject)
        : Promise.resolve(dbMock.results.shift() ?? []).then(resolve, reject);
    return builder;
  };
  return { db: { select: () => chain() } };
});

const ASSET_ID = "01a1c000-0000-7000-8000-0000000000f1";

function storedRow(section: HomeSection, overrides: Partial<StoredHome["rows"][number]> = {}) {
  return {
    id: section.id,
    sectionType: section.type,
    displayOrder: section.displayOrder,
    isVisible: section.isVisible,
    content: section.content as unknown,
    contentSchemaVersion: 1,
    ...overrides,
  };
}

function sectionOf<T extends HomeSection["type"]>(type: T): Extract<HomeSection, { type: T }> {
  const found = DEFAULT_HOME_SECTIONS.find((section) => section.type === type);
  if (!found) throw new Error(`missing default ${type}`);
  return structuredClone(found) as Extract<HomeSection, { type: T }>;
}

describe("Default home sections", () => {
  it("validate against the schema of their type", () => {
    for (const section of DEFAULT_HOME_SECTIONS) {
      const parsed = parseHomeSectionContent(section.type, section.content);
      expect(parsed.success, `${section.type} ${section.id}`).toBe(true);
    }
  });

  it("have unique ids, a dense order and a single hero first", () => {
    const ids = new Set(DEFAULT_HOME_SECTIONS.map((section) => section.id));
    expect(ids.size).toBe(DEFAULT_HOME_SECTIONS.length);
    expect(DEFAULT_HOME_SECTIONS.map((section) => section.displayOrder)).toEqual(
      DEFAULT_HOME_SECTIONS.map((_, index) => index)
    );
    expect(DEFAULT_HOME_SECTIONS.filter((s) => s.type === "video_hero")).toHaveLength(1);
    expect(DEFAULT_HOME_SECTIONS[0]?.type).toBe("video_hero");
  });

  it("are exactly what migration 0021 seeds", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../src/db/migrations/0021_home_sections.sql"),
      "utf8"
    );
    const tuples = [
      ...sql.matchAll(/\('([0-9a-f-]{36})', '([a-z_]+)', (\d+), (true|false), '(.*?)'::jsonb\)/g),
    ].map(([, id, type, order, visible, json]) => ({
      id,
      type,
      displayOrder: Number(order),
      isVisible: visible === "true",
      content: JSON.parse((json ?? "").replace(/''/g, "'")) as unknown,
    }));
    expect(tuples).toEqual(
      DEFAULT_HOME_SECTIONS.map(({ id, type, displayOrder, isVisible, content }) => ({
        id,
        type,
        displayOrder,
        isVisible,
        content,
      }))
    );
  });
});

describe("Home section content schemas", () => {
  it("reject HTML in text fields", () => {
    const hero = sectionOf("video_hero").content;
    expect(
      VideoHeroContentSchema.safeParse({ ...hero, heading: "<script>x</script>" }).success
    ).toBe(false);
  });

  it("reject unknown fields", () => {
    const hero = sectionOf("video_hero").content;
    expect(VideoHeroContentSchema.safeParse({ ...hero, extra: true }).success).toBe(false);
  });

  it("only accept well-formed YouTube ids", () => {
    const hero = sectionOf("video_hero").content;
    expect(
      VideoHeroContentSchema.safeParse({
        ...hero,
        video: { kind: "youtube", videoId: "https://youtu.be/x" },
      }).success
    ).toBe(false);
  });

  it("keep feature CTAs on internal paths", () => {
    const feature = sectionOf("feature_video").content;
    for (const href of ["https://evil.test/x", "//evil.test", "javascript:alert(1)", "productos"]) {
      expect(
        FeatureVideoContentSchema.safeParse({ ...feature, cta: { label: "Ver", href } }).success,
        href
      ).toBe(false);
    }
  });

  it("allow only https community links on allowlisted hosts", () => {
    const banner = sectionOf("community_banner").content;
    const accepts = (ctaHref: string | null) =>
      CommunityBannerContentSchema.safeParse({ ...banner, ctaHref }).success;
    expect(accepts("https://discord.gg/gamerperu")).toBe(true);
    expect(accepts(null)).toBe(true);
    expect(accepts("http://discord.gg/gamerperu")).toBe(false);
    expect(accepts("https://evil.test/discord")).toBe(false);
    expect(accepts("https://user:pass@discord.gg/x")).toBe(false);
  });

  it("require alt text for image slots and limit feature lists", () => {
    const split = sectionOf("split_showcase").content;
    expect(
      SplitShowcaseContentSchema.safeParse({ ...split, image: { mediaAssetId: null, alt: "" } })
        .success
    ).toBe(false);
    expect(
      SplitShowcaseContentSchema.safeParse({
        ...split,
        features: [...split.features, ...split.features],
      }).success
    ).toBe(false);
  });

  it("list the media slots a section references", () => {
    const compare = sectionOf("compare_slider");
    compare.content.right.image.mediaAssetId = ASSET_ID;
    expect([...listHomeSectionMediaSlots(compare)]).toEqual([["right.image", ASSET_ID]]);
  });
});

describe("Storefront home reader", () => {
  beforeEach(() => {
    vi.resetModules();
    readerModeMock.value = "postgres";
    dbMock.results = [];
    dbMock.fail = false;
  });

  async function reader() {
    return import("@/lib/home/read-home-sections");
  }

  it("never reads the database in E2E fixture mode", async () => {
    readerModeMock.value = "e2e-fixture";
    dbMock.fail = true;
    const { getStorefrontHome } = await reader();
    const home = await getStorefrontHome();
    expect(home.sections.map((s) => s.id)).toEqual(DEFAULT_HOME_SECTIONS.map((s) => s.id));
  });

  it("falls back to the defaults when the database fails or the table is empty", async () => {
    const { getStorefrontHome } = await reader();
    dbMock.fail = true;
    expect((await getStorefrontHome()).sections).toHaveLength(DEFAULT_HOME_SECTIONS.length);
    dbMock.fail = false;
    dbMock.results = [[]];
    expect((await getStorefrontHome()).sections).toHaveLength(DEFAULT_HOME_SECTIONS.length);
  });

  it("renders an empty home when every stored section is hidden", async () => {
    dbMock.results = [[storedRow(sectionOf("trust_strip"), { isVisible: false })], []];
    const { getStorefrontHome } = await reader();
    expect((await getStorefrontHome()).sections).toEqual([]);
  });

  it("skips invalid rows, puts the hero first and hides invisible sections", async () => {
    const { buildStorefrontHome } = await reader();
    const home = buildStorefrontHome({
      rows: [
        storedRow(sectionOf("trust_strip"), { displayOrder: 0 }),
        storedRow(sectionOf("catalog_rail"), { content: { title: "<b>x</b>" } }),
        storedRow(sectionOf("split_showcase"), { contentSchemaVersion: 2 }),
        storedRow(sectionOf("bento_showcase"), { isVisible: false }),
        storedRow(sectionOf("video_hero"), { displayOrder: 4 }),
      ],
      media: [],
    });
    expect(home?.sections.map((s) => s.type)).toEqual(["video_hero", "trust_strip"]);
  });

  it("falls back when every stored row is invalid", async () => {
    dbMock.results = [[storedRow(sectionOf("trust_strip"), { content: {} })], []];
    const { getStorefrontHome } = await reader();
    expect((await getStorefrontHome()).sections).toHaveLength(DEFAULT_HOME_SECTIONS.length);
  });

  it("resolves an image only when its slot is registered for that section", async () => {
    const { buildStorefrontHome } = await reader();
    const split = sectionOf("split_showcase");
    split.content.image.mediaAssetId = ASSET_ID;
    const otherAsset = "01a1c000-0000-7000-8000-0000000000f2";

    const registered = buildStorefrontHome({
      rows: [storedRow(split)],
      media: [
        { sectionId: split.id, slot: "image", mediaAssetId: ASSET_ID, objectKey: "home/a.webp" },
      ],
    });
    expect(registered?.mediaUrls).toEqual({ [ASSET_ID]: "https://cdn.test/home/a.webp" });

    const mismatched = buildStorefrontHome({
      rows: [storedRow(split)],
      media: [
        { sectionId: split.id, slot: "image", mediaAssetId: otherAsset, objectKey: "home/b.webp" },
      ],
    });
    expect(mismatched?.mediaUrls).toEqual({});
  });
});
