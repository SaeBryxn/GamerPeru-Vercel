// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VariantBoard } from "@/components/admin/products/variant-board";
import type { AdminProductDetailVariant } from "@/lib/admin/catalog/types";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  photo: vi.fn(),
  stock: vi.fn(),
}));
vi.mock("@/lib/admin/catalog/actions", () => ({
  createVariantAction: actions.create,
  updateVariantAction: actions.update,
  reassignProductMediaVariantAction: actions.photo,
}));
vi.mock("@/lib/admin/inventory/actions", () => ({ setVariantStockAction: actions.stock }));
afterEach(cleanup);

it("muestra la ficha y guarda el precio en el lugar con la acción existente", async () => {
  const variant: AdminProductDetailVariant = {
    id: "variant-1",
    productId: "product-1",
    title: "Negro",
    sku: "MOUSE-NEGRO",
    priceCents: 32900,
    compareAtPriceCents: null,
    costCents: null,
    weightGrams: 40,
    attributes: { color: "Negro" },
    status: "ACTIVE",
    displayOrder: 0,
    createdAt: new Date("2026-10-22"),
    updatedAt: new Date("2026-10-22"),
    isSkuImmutable: true,
  };
  actions.update.mockResolvedValue({
    success: true,
    data: { variant: { ...variant, priceCents: 34990 } },
  });
  const onChanged = vi.fn();
  render(
    <VariantBoard
      productId="product-1"
      variants={[variant]}
      media={[]}
      variantStock={{
        "variant-1": {
          variantId: "variant-1",
          onHand: 12,
          reserved: 2,
          allocated: 0,
          available: 10,
        },
      }}
      canManageInventory
      onChanged={onChanged}
    />
  );
  expect(screen.getByText("Activa")).toBeTruthy();
  expect(screen.getByText("12 unidades · 10 disponibles")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar Negro" }));
  fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "349.90" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar color o talla" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(actions.update).toHaveBeenCalledWith(
    expect.objectContaining({
      variantId: "variant-1",
      pricePen: "349.90",
      expectedUpdatedAt: "2026-10-22T00:00:00.000Z",
      mutationRequestId: expect.any(String),
    })
  );
  expect(actions.stock).not.toHaveBeenCalled();
});
