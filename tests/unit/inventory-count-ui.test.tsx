// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InventoryCountForm } from "@/app/admin/(protected)/inventario/stock-count";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/admin/inventory/actions", () => ({ setVariantStockAction: mocks.save }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("envía el conteo con motivo y stock anterior para detectar conflictos", async () => {
  mocks.save.mockResolvedValue({ success: true });
  render(
    <InventoryCountForm
      row={{
        product_id: "p",
        variant_id: "v",
        product_name: "Mouse",
        title: "Negro",
        sku: "M",
        on_hand: 3,
        reserved: 1,
        allocated: 0,
        available: 2,
        reorder_point: 1,
      }}
    />
  );
  fireEvent.click(screen.getByText("Registrar conteo"));
  expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    true
  );
  fireEvent.change(screen.getByLabelText("Unidades físicas"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Conteo de almacén" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      productId: "p",
      variantId: "v",
      quantity: 5,
      expectedOnHand: 3,
      reason: "Conteo de almacén",
    })
  );
  expect(mocks.refresh).toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("Conteo guardado y movimiento registrado.");
});

it("mantiene el motivo y muestra el conflicto sin refrescar ni cerrar el panel", async () => {
  mocks.save.mockResolvedValue({
    success: false,
    error: "El stock cambió. Actualiza antes de reintentar.",
  });
  render(
    <InventoryCountForm
      row={{
        product_id: "p",
        variant_id: "v",
        product_name: "Mouse",
        title: "Negro",
        sku: "M",
        on_hand: 3,
        reserved: 1,
        allocated: 0,
        available: 2,
        reorder_point: 1,
      }}
    />
  );
  fireEvent.click(screen.getByText("Registrar conteo"));
  fireEvent.change(screen.getByLabelText("Unidades físicas"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Conteo diario" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("El stock cambió"));
  expect(screen.getByLabelText("Motivo")).toHaveProperty("value", "Conteo diario");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Registrar conteo" }));
});
