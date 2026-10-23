// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import InventoryPage from "@/app/admin/(protected)/inventario/page";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/admin/inventory/page-reader", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAdminInventoryPage: mocks.read,
}));
vi.mock("@/app/admin/(protected)/inventario/stock-count", () => ({
  InventoryCountForm: () => <button>Registrar conteo</button>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const variantId = "00000000-0000-4000-8000-000000000001";
const row = {
  product_id: "p",
  variant_id: variantId,
  product_name: "Mouse",
  title: "Negro",
  sku: "M-01",
  on_hand: 4,
  reserved: 1,
  allocated: 1,
  available: 2,
  reorder_point: 3,
};
const movement = {
  id: "m",
  sku: "M-01",
  movement_type: "MANUAL_ADJUSTMENT",
  on_hand_delta: 2,
  reserved_delta: 0,
  allocated_delta: -1,
  actor_id: "autor-id",
  notes: "Conteo diario",
  created_at: "2026-10-23T14:00:00Z",
};

async function show(params: Record<string, string> = {}, rows = [row], hasNext = false) {
  mocks.read.mockImplementation(async (query) => ({
    configured: true,
    location: "PRINCIPAL",
    query,
    rows,
    hasNext,
    movements: [movement],
  }));
  return render(await InventoryPage({ searchParams: Promise.resolve(params) }));
}

it("conserva los filtros al paginar y abre el historial solo de la variante elegida", async () => {
  const view = await show({ q: "Mouse", stock: "low", page: "2" }, [row], true);
  const table = screen.getByRole("table");
  expect(within(table).getByText("Stock bajo").getAttribute("data-tone")).toBe("warning");
  const next = new URL(
    screen.getByRole("link", { name: "Página siguiente" }).getAttribute("href")!,
    "https://local.invalid"
  );
  expect(Object.fromEntries(next.searchParams)).toMatchObject({
    q: "Mouse",
    stock: "low",
    page: "3",
  });
  const history = new URL(
    screen.getByRole("link", { name: "Ver movimientos" }).getAttribute("href")!,
    "https://local.invalid"
  );
  expect(history.searchParams.get("variant")).toBe(variantId);
  view.unmount();
  await show(Object.fromEntries(history.searchParams));
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.getByRole("heading", { name: "Movimientos de la variante" })).toBeTruthy();
  expect(screen.getByText("+2")).toBeTruthy();
  expect(screen.getByText("−1")).toBeTruthy();
  expect(screen.getByText("Conteo diario")).toBeTruthy();
  expect(screen.getByText("ID del autor: autor-id").closest("details")?.hasAttribute("open")).toBe(
    false
  );
  const all = new URL(
    screen.getByRole("link", { name: "Ver todo el almacén" }).getAttribute("href")!,
    "https://local.invalid"
  );
  expect(all.searchParams.has("variant")).toBe(false);
  expect(all.searchParams.get("vista")).toBe("movimientos");
});

it("muestra un estado vacío útil y deshabilita la paginación sin resultados", async () => {
  await show({ q: "inexistente" }, []);
  expect(screen.getByRole("heading", { name: "No hay variantes para mostrar" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Restablecer filtros" }).getAttribute("href")).toBe(
    "/admin/inventario"
  );
  expect(screen.getByRole("button", { name: "Página anterior" }).hasAttribute("disabled")).toBe(
    true
  );
  expect(screen.getByRole("button", { name: "Página siguiente" }).hasAttribute("disabled")).toBe(
    true
  );
  expect(screen.queryByRole("table")).toBeNull();
});

it("distingue agotados de disponibles aunque el punto de reposición sea cero", async () => {
  await show({}, [
    { ...row, available: 0, reorder_point: 0 },
    { ...row, variant_id: "otra", available: 4 },
  ]);
  expect(screen.getByText("Agotado").getAttribute("data-tone")).toBe("danger");
  expect(screen.getByRole("table").querySelector('[data-tone="success"]')?.textContent).toBe(
    "Disponible"
  );
});

it("separa el stock negativo y limita el resumen a las variantes de esta página", async () => {
  await show({}, [
    { ...row, available: -2 },
    { ...row, variant_id: "agotada", available: 0 },
  ]);
  const summary = screen.getByRole("region", { name: "Resumen de esta página" });
  expect(within(summary).getByText("2 variantes · Según tus filtros")).toBeTruthy();
  const table = screen.getByRole("table");
  expect(within(table).getByText("Revisar inventario").getAttribute("data-tone")).toBe("danger");
  expect(within(table).getByText("-2")).toBeTruthy();
  expect(screen.getByRole("note").textContent).toContain("disponible negativo");
});

it("reinicia la página al cambiar de estado o quitar la búsqueda", async () => {
  await show({ q: "Mouse", stock: "low", page: "4" });
  const filters = screen.getByRole("navigation", { name: "Filtrar por disponibilidad" });
  const out = new URL(
    within(filters).getByRole("link", { name: "Sin disponibilidad" }).getAttribute("href")!,
    "https://local.invalid"
  );
  expect(Object.fromEntries(out.searchParams)).toMatchObject({
    q: "Mouse",
    stock: "out",
    page: "1",
  });
  const clear = new URL(
    screen.getByRole("link", { name: "Quitar búsqueda: Mouse" }).getAttribute("href")!,
    "https://local.invalid"
  );
  expect(clear.searchParams.has("q")).toBe(false);
  expect(clear.searchParams.get("stock")).toBe("low");
  expect(clear.searchParams.get("page")).toBe("1");
});
