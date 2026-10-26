import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  eligibility: "ELIGIBLE",
  rows: [] as unknown[][],
  request: vi.fn(),
  verify: vi.fn(),
  register: vi.fn(),
  complete: vi.fn(),
  setAsset: vi.fn(),
  abort: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: async () =>
    mocks.signedIn ? { success: true, identity: { authUserId: "buyer-auth" } } : { success: false },
}));
vi.mock("@/lib/reviews/actions", () => ({
  getReviewEligibilityAction: async () => ({ state: mocks.eligibility }),
}));
vi.mock("@/lib/media/resolve-public-media-url", () => ({
  resolvePublicMediaUrl: (key: string) => `/media/${key}`,
}));
vi.mock("@/lib/admin/media/direct-upload-service", () => ({
  requestDirectUpload: mocks.request,
  verifyDirectUpload: mocks.verify,
  registerDirectUploadAsset: mocks.register,
}));
vi.mock("@/lib/admin/media/upload-ledger", () => ({
  completeUpload: mocks.complete,
  setUploadAsset: mocks.setAsset,
  abortUpload: mocks.abort,
  findUpload: mocks.find,
}));
vi.mock("@/db", () => {
  const database = {
    execute: vi.fn(),
    select: () => {
      const rows = mocks.rows.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return chain;
    },
    transaction: async (run: (tx: unknown) => unknown): Promise<unknown> => run(database),
  };
  return { db: database };
});

import {
  requestReviewPhotoAction,
  confirmReviewPhotoAction,
  abortReviewPhotoAction,
} from "@/lib/reviews/photo-actions";

const productId = "018f0000-0000-7000-8000-000000000001";
const uploadId = "018f0000-0000-7000-8000-000000000002";
const request = { productId, mimeType: "image/webp", fileSizeBytes: 30000 };

describe("Autorización de subidas de fotos del comprador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signedIn = true;
    mocks.eligibility = "ELIGIBLE";
    mocks.rows = [];
    mocks.request.mockResolvedValue({ uploadId, putUrl: "https://upload.test" });
    mocks.verify.mockResolvedValue({
      id: uploadId,
      subjectId: productId,
      objectKey: "reviews/photo.webp",
    });
    mocks.register.mockResolvedValue({ asset: { id: "photo", objectKey: "reviews/photo.webp" } });
  });
  it("no firma subidas sin sesión o sin una compra entregada", async () => {
    mocks.signedIn = false;
    expect(await requestReviewPhotoAction(request)).toMatchObject({ success: false });
    mocks.signedIn = true;
    mocks.eligibility = "NOT_PURCHASED";
    expect(await requestReviewPhotoAction(request)).toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("limita tipo, tamaño y cantidad diaria antes de reservar almacenamiento", async () => {
    expect(await requestReviewPhotoAction({ ...request, mimeType: "image/svg+xml" })).toMatchObject(
      { success: false }
    );
    expect(
      await requestReviewPhotoAction({ ...request, fileSizeBytes: 3 * 1024 * 1024 })
    ).toMatchObject({ success: false });
    mocks.rows = [[{ count: 12 }]];
    expect(await requestReviewPhotoAction(request)).toMatchObject({
      success: false,
      error: expect.stringContaining("límite diario"),
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("vincula la firma al comprador y al producto desde el servidor", async () => {
    mocks.rows = [[{ count: 1 }]];
    expect(await requestReviewPhotoAction(request)).toMatchObject({ success: true });
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "buyer-auth",
        subjectId: productId,
        purpose: "review_photo",
      }),
      expect.anything()
    );
  });
  it("no confirma una foto subida para otro producto", async () => {
    mocks.verify.mockResolvedValue({ id: uploadId, subjectId: "other-product" });
    expect(await confirmReviewPhotoAction({ productId, uploadId })).toMatchObject({
      success: false,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("confirma usando la identidad verificada y un propósito fijo", async () => {
    mocks.rows = [[{ id: "customer" }]];
    expect(await confirmReviewPhotoAction({ productId, uploadId })).toMatchObject({
      success: true,
      data: { id: "photo" },
    });
    expect(mocks.verify).toHaveBeenCalledWith({
      uploadId,
      purpose: "review_photo",
      actorId: "buyer-auth",
    });
    expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), uploadId, "buyer-auth");
  });
  it("no cancela subidas de otro comprador ni del administrador", async () => {
    mocks.find.mockResolvedValue({ purpose: "review_photo", actorAuthUserId: "another-buyer" });
    expect(await abortReviewPhotoAction(uploadId)).toBe(false);
    mocks.find.mockResolvedValue({ purpose: "gallery_image", actorAuthUserId: "buyer-auth" });
    expect(await abortReviewPhotoAction(uploadId)).toBe(false);
    expect(mocks.abort).not.toHaveBeenCalled();
  });
});
