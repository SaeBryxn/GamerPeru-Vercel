import { describe, expect, it } from "vitest";
import {
  reorderHomeSections,
  setHomeSectionVisibility,
  updateHomeSectionContent,
} from "@/lib/home/home-sections-service";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

const ADMIN: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "admin-1",
  email: null,
  roles: [],
  permissions: new Set(["catalog:manage"]),
};

const VIDEO_ID = "01a1c000-0000-7000-8000-0000000000b1";
const POSTER_ID = "01a1c000-0000-7000-8000-0000000000b2";

interface Recorded {
  updates: Record<string, unknown>[];
  inserts: Record<string, unknown>[][];
  deletes: number;
  locks: number;
}

/**
 * A transaction double: `select` calls resolve, in order, to the queued results; writes are
 * recorded instead of executed.
 */
function fakeDatabase(selects: unknown[][]) {
  const recorded: Recorded = { updates: [], inserts: [], deletes: 0, locks: 0 };
  const queue = [...selects];
  const chain = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "innerJoin"]) builder[method] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(queue.shift() ?? []).then(resolve);
    return builder;
  };
  const tx = {
    execute: async () => {
      recorded.locks += 1;
    },
    select: () => chain(),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          recorded.updates.push(values);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        recorded.deletes += 1;
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown> | Record<string, unknown>[]) => {
        recorded.inserts.push(Array.isArray(values) ? values : [values]);
      },
    }),
  };
  const database = { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
  return { database, recorded };
}

function row(index: number, overrides: Record<string, unknown> = {}) {
  const section = DEFAULT_HOME_SECTIONS[index]!;
  return {
    id: section.id,
    sectionType: section.type,
    displayOrder: section.displayOrder,
    isVisible: true,
    content: structuredClone(section.content),
    contentSchemaVersion: 1,
    version: 3,
    ...overrides,
  };
}

const hero = () => row(0);
const options = (database: never) => ({ authContext: ADMIN, database });

describe("Home section content updates", () => {
  it("refuse a stale version", async () => {
    const { database, recorded } = fakeDatabase([[hero()]]);
    await expect(
      updateHomeSectionContent(
        { sectionId: hero().id, expectedVersion: 2, content: hero().content },
        options(database)
      )
    ).rejects.toMatchObject({ code: "HOME_SECTION_CONFLICT" });
    expect(recorded.updates).toHaveLength(0);
  });

  it("reject content that does not match the section type", async () => {
    const { database } = fakeDatabase([[hero()]]);
    await expect(
      updateHomeSectionContent(
        { sectionId: hero().id, expectedVersion: 3, content: { heading: "<b>x</b>" } },
        options(database)
      )
    ).rejects.toMatchObject({ code: "HOME_SECTION_INVALID" });
  });

  it("reject a video slot filled with an image asset", async () => {
    const content = {
      ...hero().content,
      video: { kind: "upload", videoAssetId: VIDEO_ID, posterAssetId: POSTER_ID },
    };
    const { database, recorded } = fakeDatabase([
      [hero()],
      [
        { id: VIDEO_ID, mediaType: "IMAGE", securityClass: "PUBLIC_MEDIA" },
        { id: POSTER_ID, mediaType: "IMAGE", securityClass: "PUBLIC_MEDIA" },
      ],
    ]);
    await expect(
      updateHomeSectionContent(
        { sectionId: hero().id, expectedVersion: 3, content },
        options(database)
      )
    ).rejects.toMatchObject({ code: "HOME_SECTION_MEDIA_INVALID" });
    expect(recorded.updates).toHaveLength(0);
  });

  it("reject private assets", async () => {
    const split = row(3);
    const content = {
      ...split.content,
      image: { mediaAssetId: POSTER_ID, alt: "Mouse destacado" },
    };
    const { database } = fakeDatabase([
      [split],
      [{ id: POSTER_ID, mediaType: "IMAGE", securityClass: "PRIVATE_PAYMENT_PROOF" }],
    ]);
    await expect(
      updateHomeSectionContent(
        { sectionId: split.id, expectedVersion: 3, content },
        options(database)
      )
    ).rejects.toMatchObject({ code: "HOME_SECTION_MEDIA_INVALID" });
  });

  it("save the content, sync media slots and audit the previous content", async () => {
    const content = {
      ...hero().content,
      video: { kind: "upload", videoAssetId: VIDEO_ID, posterAssetId: POSTER_ID },
    };
    const { database, recorded } = fakeDatabase([
      [hero()],
      [
        { id: VIDEO_ID, mediaType: "VIDEO", securityClass: "PUBLIC_MEDIA" },
        { id: POSTER_ID, mediaType: "IMAGE", securityClass: "PUBLIC_MEDIA" },
      ],
    ]);
    const result = await updateHomeSectionContent(
      { sectionId: hero().id, expectedVersion: 3, content },
      options(database)
    );

    expect(result).toEqual({ version: 4 });
    expect(recorded.locks).toBe(1);
    expect(recorded.updates[0]).toMatchObject({
      version: 4,
      content,
      updatedByAuthUserId: "admin-1",
    });
    expect(recorded.deletes).toBe(1);
    expect(recorded.inserts[0]).toEqual([
      { sectionId: hero().id, slot: "video.file", mediaAssetId: VIDEO_ID },
      { sectionId: hero().id, slot: "video.poster", mediaAssetId: POSTER_ID },
    ]);
    expect(recorded.inserts[1]?.[0]).toMatchObject({
      action: "home:section:update",
      targetId: hero().id,
      metadata: { previous_version: 3, previous_content: hero().content },
    });
  });

  it("require catalog permission", async () => {
    const { database } = fakeDatabase([]);
    await expect(
      updateHomeSectionContent(
        { sectionId: hero().id, expectedVersion: 3, content: {} },
        { authContext: { ...ADMIN, permissions: new Set(["orders:verify"]) }, database }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Home section visibility", () => {
  it("hide a section and record it", async () => {
    const { database, recorded } = fakeDatabase([[row(4)]]);
    const result = await setHomeSectionVisibility(
      { sectionId: row(4).id, expectedVersion: 3, isVisible: false },
      options(database)
    );
    expect(result).toEqual({ version: 4 });
    expect(recorded.updates[0]).toMatchObject({ isVisible: false, version: 4 });
    expect(recorded.inserts[0]?.[0]).toMatchObject({ action: "home:section:hide" });
  });

  it("do nothing when the section already has that visibility", async () => {
    const { database, recorded } = fakeDatabase([[row(4)]]);
    await setHomeSectionVisibility(
      { sectionId: row(4).id, expectedVersion: 3, isVisible: true },
      options(database)
    );
    expect(recorded.updates).toHaveLength(0);
    expect(recorded.inserts).toHaveLength(0);
  });
});

describe("Home section order", () => {
  const stored = () => [0, 1, 2, 3].map((index) => row(index));
  const ids = () => stored().map((section) => section.id);

  it("refuse when the stored order changed since the operator read it", async () => {
    const { database } = fakeDatabase([stored()]);
    const [a, b, c, d] = ids();
    await expect(
      reorderHomeSections(
        { orderedIds: [a!, c!, b!, d!], expectedOrder: [a!, b!, d!, c!] },
        options(database)
      )
    ).rejects.toMatchObject({ code: "HOME_SECTION_CONFLICT" });
  });

  it("keep the hero first", async () => {
    const { database } = fakeDatabase([stored()]);
    const [a, b, c, d] = ids();
    await expect(
      reorderHomeSections({ orderedIds: [b!, a!, c!, d!], expectedOrder: ids() }, options(database))
    ).rejects.toMatchObject({ code: "HOME_SECTION_HERO_FIRST" });
  });

  it("require every section exactly once", async () => {
    const { database } = fakeDatabase([stored()]);
    const [a, b, c] = ids();
    await expect(
      reorderHomeSections({ orderedIds: [a!, b!, c!, c!], expectedOrder: ids() }, options(database))
    ).rejects.toMatchObject({ code: "HOME_SECTION_ORDER_INVALID" });
  });

  it("move only the rows whose position changed", async () => {
    const { database, recorded } = fakeDatabase([stored()]);
    const [a, b, c, d] = ids();
    const result = await reorderHomeSections(
      { orderedIds: [a!, c!, b!, d!], expectedOrder: ids() },
      options(database)
    );
    expect(recorded.updates).toEqual([
      expect.objectContaining({ displayOrder: 1, version: 4 }),
      expect.objectContaining({ displayOrder: 2, version: 4 }),
    ]);
    expect(result.versions).toEqual({ [a!]: 3, [b!]: 4, [c!]: 4, [d!]: 3 });
    expect(recorded.inserts[0]?.[0]).toMatchObject({
      action: "home:section:reorder",
      metadata: { previous_order: ids(), order: [a, c, b, d] },
    });
  });
});
