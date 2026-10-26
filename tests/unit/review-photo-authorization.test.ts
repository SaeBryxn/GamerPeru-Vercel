import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  customer: "customer",
  results: [] as unknown[][],
  inserts: vi.fn(),
}));
vi.mock("@/lib/wishlist/customer", () => ({
  resolveCurrentCustomerId: async () => state.customer || null,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const result = state.results.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "innerJoin", "where", "limit"]) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
    insert: () => ({
      values: (values: unknown) => {
        state.inserts(values);
        return { onConflictDoNothing: () => ({ returning: async () => [{ id: "review" }] }) };
      },
    }),
  },
}));

import { submitReviewAction } from "@/lib/reviews/actions";

const productId = "018f0000-0000-7000-8000-000000000001";
const photo = "018f0000-0000-7000-8000-000000000002";
const input = {
  productId,
  rating: 5,
  title: "Buen mouse",
  body: "Recibí mi producto y funciona muy bien.",
  photoAssetIds: [photo],
};

describe("Fotos de opiniones de compradores verificados", () => {
  beforeEach(() => {
    state.customer = "customer";
    state.results = [];
    state.inserts.mockReset();
  });
  const purchase = () => {
    state.results = [
      [{ id: productId }],
      [{ orderItemId: "line" }],
      [{ firstName: "Ana", lastName: "Pérez", authUserId: "auth-buyer" }],
    ];
  };
  it("no acepta fotos de visitantes sin sesión", async () => {
    state.customer = "";
    expect(await submitReviewAction(input)).toMatchObject({ ok: false, reason: "UNAUTHENTICATED" });
    expect(state.inserts).not.toHaveBeenCalled();
  });
  it("rechaza más de tres fotos y referencias duplicadas antes de escribir", async () => {
    expect(await submitReviewAction({ ...input, photoAssetIds: [photo, photo] })).toMatchObject({
      ok: false,
      reason: "INVALID",
    });
    expect(
      await submitReviewAction({ ...input, photoAssetIds: [photo, photo, photo, photo] })
    ).toMatchObject({ ok: false, reason: "INVALID" });
    expect(state.inserts).not.toHaveBeenCalled();
  });
  it("rechaza fotos ajenas, de otro producto o sin confirmar", async () => {
    purchase();
    state.results.push([]);
    expect(await submitReviewAction(input)).toMatchObject({ ok: false, reason: "INVALID" });
    expect(state.inserts).not.toHaveBeenCalled();
  });
  it("guarda las fotos autorizadas como una opinión pendiente de moderación", async () => {
    purchase();
    state.results.push([{ assetId: photo }]);
    expect(await submitReviewAction(input)).toEqual({ ok: true });
    expect(state.inserts).toHaveBeenCalledWith(
      expect.objectContaining({ photoAssetIds: [photo], authorName: "Ana P.", orderItemId: "line" })
    );
    expect(state.inserts.mock.calls[0]?.[0]).not.toHaveProperty("status");
  });
  it("conserva el envío de opiniones sin fotos", async () => {
    purchase();
    const { photoAssetIds: _photos, ...withoutPhotos } = input;
    expect(await submitReviewAction(withoutPhotos)).toEqual({ ok: true });
    expect(state.inserts).toHaveBeenCalledWith(expect.objectContaining({ photoAssetIds: [] }));
  });
});
