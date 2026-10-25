import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  convertPersistedStoryToAuthoring,
  validatePersistedStoryReferences,
} from "@/lib/admin/catalog/story-references";

const productId = "018f0000-0000-7000-8000-00000000d001";
const existing = {
  id: "018f0000-0000-7000-8000-00000000d002",
  slug: "atk-a9-pro-max-white",
  status: "PUBLISHED",
  brand_status: "PUBLISHED",
  category_status: "PUBLISHED",
  has_active_variant: true,
};
// Only the related-products lookup runs: the story has no media.
const executor = { execute: vi.fn(async () => [existing]) } as never;
const document = [
  {
    block_id: "b1",
    type: "related_products",
    payload: { title: "Combínalo con", productSlugs: [existing.slug, "producto-eliminado"] },
  },
] as never;

describe("historia con un producto relacionado que ya no existe", () => {
  it("el editor la abre sin ese producto en vez de fallar", async () => {
    const authoring = await convertPersistedStoryToAuthoring(executor, productId, document);
    expect(authoring).toEqual([
      {
        blockId: "b1",
        type: "related_products",
        payload: { title: "Combínalo con", productIds: [existing.id] },
      },
    ]);
  });

  it("guardar sigue rechazando la referencia rota", async () => {
    await expect(
      validatePersistedStoryReferences(executor, productId, document, {
        requirePublicRelatedProducts: false,
      })
    ).rejects.toThrow("La historia contiene campos inválidos.");
  });
});
