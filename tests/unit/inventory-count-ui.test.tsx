// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InventoryCountForm } from "@/app/admin/(protected)/inventario/stock-count";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/admin/inventory/actions", () => ({ setVariantStockAction: mocks.save }));
const row = {
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
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function enterCount(value = "5") {
  fireEvent.click(screen.getByRole("button", { name: "Registrar conteo" }));
  fireEvent.change(screen.getByLabelText("Unidades físicas"), { target: { value } });
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Conteo diario" } });
}

it("muestra la diferencia antes de guardar y envía el stock original", async () => {
  mocks.save.mockResolvedValue({ success: true });
  render(<InventoryCountForm row={row} />);
  enterCount();
  expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  expect(screen.getByText("+2 unidades")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      productId: "p",
      variantId: "v",
      quantity: 5,
      expectedOnHand: 3,
      reason: "Conteo diario",
    })
  );
  expect(mocks.refresh).toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("Conteo guardado y movimiento registrado.");
  expect(screen.queryByRole("button", { name: "Guardar conteo" })).toBeNull();
});

it("conserva el motivo ante un error y pide confirmar antes de descartar", async () => {
  mocks.save.mockResolvedValue({ success: false, error: "No se pudo guardar el conteo." });
  render(<InventoryCountForm row={row} />);
  enterCount("4");
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar")
  );
  expect(screen.getByLabelText("Motivo")).toHaveProperty("value", "Conteo diario");
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByText("¿Descartar este conteo?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(screen.queryByText("¿Descartar este conteo?")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Registrar conteo" }));
});

it("conserva el conteo si cambian las existencias y exige revisar la nueva referencia", async () => {
  mocks.save.mockResolvedValue({ success: true });
  const view = render(<InventoryCountForm row={row} />);
  enterCount("8");
  view.rerender(<InventoryCountForm row={{ ...row, on_hand: 5, available: 4 }} />);
  expect(screen.getByLabelText("Unidades físicas")).toHaveProperty("value", "8");
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    true
  );
  fireEvent.click(screen.getByRole("button", { name: "Usar valores actualizados" }));
  expect(screen.getByText("+3 unidades")).toBeTruthy();
  expect(screen.getByLabelText("Motivo")).toHaveProperty("value", "Conteo diario");
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 8, expectedOnHand: 5, reason: "Conteo diario" })
    )
  );
});

it("bloquea envíos duplicados mientras guarda y muestra el estado de espera", async () => {
  let finish!: (value: { success: boolean }) => void;
  mocks.save.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  render(<InventoryCountForm row={row} />);
  enterCount();
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  expect(screen.getByRole("button", { name: "Guardando…" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Guardando…" }));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ success: true });
  });
});

it("acepta cero, rechaza cantidades inválidas y advierte si faltarán unidades comprometidas", () => {
  render(<InventoryCountForm row={row} />);
  enterCount("0");
  expect(screen.getByText("−3 unidades")).toBeTruthy();
  expect(screen.getByRole("note").textContent).toContain("menor que las unidades reservadas");
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    false
  );
  fireEvent.change(screen.getByLabelText("Unidades físicas"), { target: { value: "1.5" } });
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    true
  );
});

it("bloquea un conflicto del servidor hasta revisar el inventario actualizado", async () => {
  mocks.save.mockResolvedValue({
    success: false,
    code: "STALE_INVENTORY",
    error: "El stock cambió. Actualiza antes de reintentar.",
  });
  const view = render(<InventoryCountForm row={row} />);
  enterCount("8");
  fireEvent.click(screen.getByRole("button", { name: "Guardar conteo" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Actualizar inventario" })).toBeTruthy()
  );
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    true
  );
  fireEvent.click(screen.getByRole("button", { name: "Actualizar inventario" }));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  view.rerender(<InventoryCountForm row={{ ...row, on_hand: 6, available: 5 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Usar valores actualizados" }));
  expect(screen.getByLabelText("Unidades físicas")).toHaveProperty("value", "8");
  expect(screen.getByLabelText("Motivo")).toHaveProperty("value", "Conteo diario");
  expect(screen.getByRole("button", { name: "Guardar conteo" }).hasAttribute("disabled")).toBe(
    false
  );
});
