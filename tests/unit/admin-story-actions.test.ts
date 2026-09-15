import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AuthRbac from "@/lib/auth/rbac";
import type * as StoryService from "@/lib/admin/catalog/story-service";

const mocks = vi.hoisted(() => ({
  getVerifiedAuthContext: vi.fn(),
  revalidatePath: vi.fn(),
  saveProductStoryDraft: vi.fn(),
  discardProductStoryDraft: vi.fn(),
  publishProductStory: vi.fn(),
  unpublishProductStory: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/auth/rbac", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthRbac>();
  return { ...actual, getVerifiedAuthContext: mocks.getVerifiedAuthContext };
});

vi.mock("@/lib/admin/catalog/story-service", async (importOriginal) => {
  const actual = await importOriginal<typeof StoryService>();
  return {
    ...actual,
    saveProductStoryDraft: mocks.saveProductStoryDraft,
    discardProductStoryDraft: mocks.discardProductStoryDraft,
    publishProductStory: mocks.publishProductStory,
    unpublishProductStory: mocks.unpublishProductStory,
  };
});

import {
  discardProductStoryDraftAction,
  publishProductStoryAction,
  saveProductStoryDraftAction,
  unpublishProductStoryAction,
} from "@/lib/admin/catalog/story-actions";
import { StoryStaleWriteError } from "@/lib/admin/catalog/story-service";
import { StoryValidationError } from "@/lib/admin/catalog/story-validation";

const productId = "018f0026-2000-7000-8000-000000000001";
const draftId = "018f0026-2000-7000-8000-000000000002";
const publishedId = "018f0026-2000-7000-8000-000000000003";
const mutationRequestId = "018f0026-2000-7000-8000-000000000004";
const pointerInput = {
  productId,
  expectedDraftRevisionId: draftId,
  expectedPublishedRevisionId: publishedId,
  mutationRequestId,
};
const saveInput = {
  ...pointerInput,
  document: [{ blockId: "intro", type: "text_section", payload: { body: "Historia" } }],
};
const result = {
  productId,
  productSlug: "producto-story",
  revisionId: draftId,
  revisionNumber: 2,
  draftRevisionId: draftId,
  publishedRevisionId: publishedId,
  publishedAt: null,
  replayed: false,
};

const operations = [
  {
    name: "save draft",
    permission: "catalog:manage",
    action: () => saveProductStoryDraftAction(saveInput),
    service: mocks.saveProductStoryDraft,
    publicPath: false,
  },
  {
    name: "discard draft",
    permission: "catalog:manage",
    action: () => discardProductStoryDraftAction(pointerInput),
    service: mocks.discardProductStoryDraft,
    publicPath: false,
  },
  {
    name: "publish",
    permission: "catalog:publish",
    action: () => publishProductStoryAction(pointerInput),
    service: mocks.publishProductStory,
    publicPath: true,
  },
  {
    name: "unpublish",
    permission: "catalog:publish",
    action: () => unpublishProductStoryAction(pointerInput),
    service: mocks.unpublishProductStory,
    publicPath: true,
  },
] as const;

describe("GP-026 CHK1 thin Story Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(operations)(
    "rejects unauthenticated $name without calling its service",
    async (entry) => {
      mocks.getVerifiedAuthContext.mockResolvedValue({ status: "UNAUTHENTICATED" });
      await expect(entry.action()).resolves.toMatchObject({
        success: false,
        code: "AUTHENTICATION_REQUIRED",
      });
      expect(entry.service).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it.each(operations)("rejects $name when the verified permission is missing", async (entry) => {
    mocks.getVerifiedAuthContext.mockResolvedValue({
      status: "READY",
      authUserId: "018f0026-2000-7000-8000-000000000005",
      email: "story-action@gamerperu.invalid",
      roles: ["ADMIN_ORDERS"],
      permissions: new Set([
        entry.permission === "catalog:manage" ? "catalog:publish" : "catalog:manage",
      ]),
    });
    await expect(entry.action()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    expect(entry.service).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(operations)("authorizes $name and delegates exactly once", async (entry) => {
    const authContext = {
      status: "READY" as const,
      authUserId: "018f0026-2000-7000-8000-000000000005",
      email: "story-action@gamerperu.invalid",
      roles: ["ADMIN_CATALOG"] as const,
      permissions: new Set([entry.permission]),
    };
    mocks.getVerifiedAuthContext.mockResolvedValue(authContext);
    entry.service.mockResolvedValue(result);

    await expect(entry.action()).resolves.toEqual({ success: true, data: result });
    expect(entry.service).toHaveBeenCalledTimes(1);
    expect(entry.service).toHaveBeenCalledWith(expect.any(Object), { authContext });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/products/${productId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/products/${productId}/story`);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(entry.publicPath ? 3 : 2);
    if (entry.publicPath) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/productos/producto-story");
    }
  });

  it("maps strict field errors without revalidating paths", async () => {
    mocks.getVerifiedAuthContext.mockResolvedValue({
      status: "READY",
      authUserId: "018f0026-2000-7000-8000-000000000005",
      email: "story-action@gamerperu.invalid",
      roles: ["ADMIN_CATALOG"],
      permissions: new Set(["catalog:manage"]),
    });
    mocks.saveProductStoryDraft.mockRejectedValue(
      new StoryValidationError([
        {
          code: "too_small",
          path: "document.0.payload.body",
          message: "El texto no puede quedar vacío.",
        },
      ])
    );
    await expect(saveProductStoryDraftAction(saveInput)).resolves.toMatchObject({
      success: false,
      code: "STORY_VALIDATION_ERROR",
      fieldErrors: [{ path: "document.0.payload.body" }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns current concurrency tokens for stale writes", async () => {
    mocks.getVerifiedAuthContext.mockResolvedValue({
      status: "READY",
      authUserId: "018f0026-2000-7000-8000-000000000005",
      email: "story-action@gamerperu.invalid",
      roles: ["ADMIN_CATALOG"],
      permissions: new Set(["catalog:publish"]),
    });
    mocks.publishProductStory.mockRejectedValue(new StoryStaleWriteError(draftId, publishedId));
    await expect(publishProductStoryAction(pointerInput)).resolves.toMatchObject({
      success: false,
      code: "STORY_STALE_WRITE",
      currentDraftRevisionId: draftId,
      currentPublishedRevisionId: publishedId,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
