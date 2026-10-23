// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteProductAction: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/admin/catalog/actions", () => ({ deleteProductAction: mocks.deleteProductAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

const { DeleteProductButton } =
  await import("@/app/admin/(protected)/products/[productId]/delete-product-button");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = {
  productId: "p1",
  productName: "ATK Blazing Sky Phantom",
  status: "DRAFT" as const,
  updatedAt: "2026-10-23T12:00:00.000Z",
  canDeleteLive: false,
};

it("pide confirmación nombrando el producto y vuelve al catálogo al eliminar", async () => {
  mocks.deleteProductAction.mockResolvedValue({
    success: true,
    data: { productId: "p1", name: props.productName },
  });
  render(<DeleteProductButton {...props} />);
  fireEvent.click(screen.getByTestId("btn-delete-product"));
  expect(screen.getByText("Eliminar «ATK Blazing Sky Phantom»")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Eliminar para siempre" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/products"));
  expect(mocks.deleteProductAction).toHaveBeenCalledWith({
    productId: "p1",
    expectedUpdatedAt: "2026-10-23T12:00:00.000Z",
  });
});

it("muestra por qué no se pudo cuando el producto ya tiene pedidos", async () => {
  mocks.deleteProductAction.mockResolvedValue({
    success: false,
    code: "PRODUCT_HAS_ORDERS",
    error: "Este producto ya tiene pedidos, así que no se puede eliminar sin romper su historial.",
  });
  render(<DeleteProductButton {...props} />);
  fireEvent.click(screen.getByTestId("btn-delete-product"));
  fireEvent.click(screen.getByRole("button", { name: "Eliminar para siempre" }));
  expect((await screen.findByTestId("delete-product-error")).textContent).toContain(
    "ya tiene pedidos"
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("un producto en la tienda no se puede eliminar sin permiso de publicación", () => {
  render(<DeleteProductButton {...props} status="PUBLISHED" />);
  expect(screen.getByTestId("btn-delete-product").hasAttribute("disabled")).toBe(true);
});
