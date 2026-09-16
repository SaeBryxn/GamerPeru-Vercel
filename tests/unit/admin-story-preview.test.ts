import type * as StoryValidationModule from "@/lib/catalog/story-validation";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAdminProductStoryPreview } from "@/lib/admin/catalog/story-reader";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getCachedStoryRelatedProducts: vi.fn(),
  validateStoryBlocks: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
  },
}));

vi.mock("@/lib/catalog/cached-queries", () => ({
  getCachedStoryRelatedProducts: (...args: unknown[]) =>
    mocks.getCachedStoryRelatedProducts(...args),
}));

vi.mock("@/lib/catalog/story-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof StoryValidationModule>();
  return {
    ...actual,
    validateStoryBlocks: (
      document: unknown,
      context?: { productId?: string; revisionId?: string }
    ) => {
      if (mocks.validateStoryBlocks.getMockImplementation()) {
        return mocks.validateStoryBlocks(document, context);
      }
      return actual.validateStoryBlocks(document, context);
    },
  };
});

const PRODUCT_ID = "018f0026-0000-7000-8000-000000000001";
const OTHER_PRODUCT_ID = "018f0026-0000-7000-8000-000000000002";
const DRAFT_REVISION_ID = "018f0026-0000-7000-8000-000000000010";
const STALE_REVISION_ID = "018f0026-0000-7000-8000-000000000011";

const validManageAuth: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "user-1",
  roles: ["ADMIN_CATALOG"],
  permissions: new Set(["catalog:manage"]),
  email: "admin@gamerperu.com",
};

const insufficientAuth: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "user-2",
  roles: ["ADMIN_ORDERS"],
  permissions: new Set(["orders:manage"]),
  email: "staff@gamerperu.com",
};

const validStatBlock = {
  block_id: "018f0026-0000-7000-8000-000000000101",
  type: "stat_highlight",
  order: 1,
  payload: {
    title: "Rendimiento",
    stats: [{ value: "26K", label: "DPI" }],
  },
};

const validRelatedProductsBlock = {
  block_id: "018f0026-0000-7000-8000-000000000102",
  type: "related_products",
  order: 2,
  payload: {
    title: "Recomendados",
    productSlugs: ["mousepad-gamer-pro"],
  },
};

describe("getAdminProductStoryPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when authContext lacks catalog:manage", async () => {
    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: insufficientAuth,
      })
    ).rejects.toThrowError(CatalogDomainError);
  });

  it("fails closed on missing revisionId (Blocker B)", async () => {
    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, "", {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_INVALID_REQUEST",
      httpStatus: 422,
    });
  });

  it("fails closed on malformed productId or revisionId UUID", async () => {
    await expect(
      getAdminProductStoryPreview("invalid-uuid", DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toThrowError(CatalogDomainError);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, "not-a-uuid", {
        authContext: validManageAuth,
      })
    ).rejects.toThrowError(CatalogDomainError);
  });

  it("fails closed with 404 when product does not exist", async () => {
    mocks.execute.mockResolvedValueOnce([]); // product lookup returns empty

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("fails closed with 404 when revision is not current draft (stale draft revision selector)", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }]) // product
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID, // current is DRAFT_REVISION_ID
          published_revision_id: null,
        },
      ]); // aggregate

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, STALE_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_REVISION_NOT_CURRENT_DRAFT",
      httpStatus: 404,
    });
  });

  it("fails closed with 404 on cross-product revision selector (IDOR protection)", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: OTHER_PRODUCT_ID, // belongs to another product!
          revision_number: 1,
          status: "DRAFT",
          blocks: [],
          published_at: null,
          created_at: new Date(),
        },
      ]);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_REVISION_INVALID",
      httpStatus: 404,
    });
  });

  it("fails closed with 404 when revision status is PUBLISHED or ARCHIVED", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 1,
          status: "PUBLISHED", // not DRAFT
          blocks: [],
          published_at: new Date(),
          created_at: new Date(),
        },
      ]);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_REVISION_INVALID",
      httpStatus: 404,
    });
  });

  it("fails closed with 404 when revision status is ARCHIVED", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 1,
          status: "ARCHIVED", // explicitly ARCHIVED
          blocks: [],
          published_at: null,
          created_at: new Date(),
        },
      ]);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_REVISION_INVALID",
      httpStatus: 404,
    });
  });

  it("distinguishes empty draft explicitly as a valid private empty preview state", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 2,
          status: "DRAFT",
          blocks: [], // empty draft
          published_at: null,
          created_at: new Date(),
        },
      ]);

    const preview = await getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
      authContext: validManageAuth,
    });

    expect(preview.isEmpty).toBe(true);
    expect(preview.validatedBlocks).toEqual([]);
    expect(preview.draft.revisionNumber).toBe(2);
    expect(preview.product.name).toBe("Mouse Pro");
  });

  it("returns projected validated blocks with public-slug keyed related products map", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 5,
          status: "DRAFT",
          blocks: [validStatBlock, validRelatedProductsBlock],
          published_at: null,
          created_at: new Date(),
        },
      ])
      // Reference validation query for related products
      .mockResolvedValueOnce([
        {
          id: "018f0026-0000-7000-8000-000000000099",
          slug: "mousepad-gamer-pro",
          status: "PUBLISHED",
          brand_status: "PUBLISHED",
          category_status: "PUBLISHED",
          has_active_variant: true,
        },
      ]);

    mocks.getCachedStoryRelatedProducts.mockResolvedValueOnce([
      {
        id: "018f0026-0000-7000-8000-000000000099",
        name: "Mousepad Gamer Pro",
        slug: "mousepad-gamer-pro",
        status: "PUBLISHED",
      },
    ]);

    const preview = await getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
      authContext: validManageAuth,
    });

    expect(preview.isEmpty).toBe(false);
    expect(preview.validatedBlocks).toHaveLength(2);
    expect(preview.draft.revisionNumber).toBe(5);
    // Amendment 6: must be keyed by slug, NOT ID
    expect(preview.relatedProductsMap.get("mousepad-gamer-pro")).toBeDefined();
    expect(preview.relatedProductsMap.get("mousepad-gamer-pro")?.name).toBe("Mousepad Gamer Pro");
  });

  it("fails closed when persisted blocks fail strict validation", async () => {
    const malformedBlock = {
      block_id: "018f0026-0000-7000-8000-000000000103",
      type: "invalid_unknown_type",
      order: 1,
      payload: {},
    };

    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 3,
          status: "DRAFT",
          blocks: [malformedBlock],
          published_at: null,
          created_at: new Date(),
        },
      ]);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toThrow();
  });

  it("fails closed when canonical public projection is incomplete or null (Amendment 16B)", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Mouse Pro", slug: "mouse-pro" }])
      .mockResolvedValueOnce([
        {
          product_id: PRODUCT_ID,
          draft_revision_id: DRAFT_REVISION_ID,
          published_revision_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: DRAFT_REVISION_ID,
          product_id: PRODUCT_ID,
          revision_number: 3,
          status: "DRAFT",
          blocks: [validStatBlock],
          published_at: null,
          created_at: new Date(),
        },
      ]);

    mocks.validateStoryBlocks.mockReturnValueOnce(null);

    await expect(
      getAdminProductStoryPreview(PRODUCT_ID, DRAFT_REVISION_ID, {
        authContext: validManageAuth,
      })
    ).rejects.toMatchObject({
      code: "STORY_PROJECTION_FAILED",
      httpStatus: 422,
    });
  });
});
