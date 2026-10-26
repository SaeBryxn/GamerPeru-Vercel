import { beforeEach, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), sanitize: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ getVerifiedAuthContext: deps.auth }));
vi.mock("@/lib/admin/catalog/readers", () => ({ getAdminProductDetail: deps.read }));
vi.mock("@/lib/admin/catalog/ui-dto", () => ({ sanitizeProductDetailForUi: deps.sanitize }));
import { getQuickProductDetailAction } from "@/lib/admin/catalog/quick-view-action";

beforeEach(() => vi.clearAllMocks());
const productId = "0193b057-0000-7000-8000-0000000000a1";

it("requires verified catalog permission before reading product details", async () => {
  deps.auth.mockResolvedValue({ status: "READY", permissions: new Set() });
  expect(await getQuickProductDetailAction(productId)).toMatchObject({
    success: false,
    code: "FORBIDDEN",
  });
  deps.auth.mockResolvedValue({ status: "SIGNED_OUT" });
  expect(await getQuickProductDetailAction(productId)).toMatchObject({ success: false });
  expect(deps.read).not.toHaveBeenCalled();
});

it("returns a minimal DTO with sanitized images and per-variant concurrency versions", async () => {
  const auth = { status: "READY", permissions: new Set(["catalog:manage"]) };
  deps.auth.mockResolvedValue(auth);
  deps.read.mockResolvedValue({ privateStorage: "never-forward-this" });
  deps.sanitize.mockReturnValue({
    product: { id: productId, name: "ATK A9", slug: "atk-a9", status: "PUBLISHED" },
    brand: { name: "ATK" },
    category: { name: "Mouses" },
    primaryMedia: { publicUrl: null, objectKey: "private-key" },
    media: [{ variantId: "v1", mediaType: "IMAGE", publicUrl: "/safe.png" }],
    variants: [
      {
        id: "v1",
        title: "Negro",
        status: "ACTIVE",
        priceCents: 32900,
        compareAtPriceCents: null,
        costCents: 10000,
        updatedAt: new Date("2026-10-26T10:00:00Z"),
      },
    ],
  });
  const result = await getQuickProductDetailAction(productId);
  expect(deps.read).toHaveBeenCalledWith(productId, { authContext: auth });
  expect(result).toMatchObject({
    success: true,
    data: {
      imageUrl: null,
      variants: [{ id: "v1", imageUrl: "/safe.png", updatedAt: "2026-10-26T10:00:00.000Z" }],
    },
  });
  expect(JSON.stringify(result)).not.toMatch(/objectKey|private-key|costCents|privateStorage/);
});

it("handles invalid, missing and unavailable products without exposing database errors", async () => {
  deps.auth.mockResolvedValue({ status: "READY", permissions: new Set(["catalog:manage"]) });
  expect(await getQuickProductDetailAction("bad-id")).toMatchObject({ success: false });
  expect(deps.read).not.toHaveBeenCalled();
  deps.read.mockResolvedValue(null);
  expect(await getQuickProductDetailAction(productId)).toMatchObject({ success: false });
  deps.read.mockRejectedValue(new Error("database-secret"));
  expect(JSON.stringify(await getQuickProductDetailAction(productId))).not.toContain(
    "database-secret"
  );
});
