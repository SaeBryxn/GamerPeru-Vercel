// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { searchAdmin } from "@/lib/admin/admin-search";
import { withAdminAccess } from "@/lib/admin/admin-api";
import * as rbac from "@/lib/auth/rbac";
import type * as RbacModule from "@/lib/auth/rbac";
import type { PermissionName } from "@/lib/auth/rbac";
import { AdminSearch } from "@/components/admin/admin-search";
import { AdminNotifications } from "@/components/admin/admin-notifications";
import { CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof RbacModule>("@/lib/auth/rbac");
  return { ...actual, requireAdminAccess: vi.fn() };
});

const execute = db.execute as unknown as ReturnType<typeof vi.fn>;
const only =
  (...permissions: PermissionName[]) =>
  (permission: PermissionName) =>
    permissions.includes(permission);

beforeEach(() => {
  execute.mockReset();
  router.push.mockReset();
});

describe("searchAdmin", () => {
  it("does not query for one character or without a searchable screen", async () => {
    expect(await searchAdmin("G", only("orders:manage"))).toEqual({ orders: [], products: [] });
    expect(await searchAdmin("GP-12", only("staff:manage"))).toEqual({ orders: [], products: [] });
    expect(execute).not.toHaveBeenCalled();
  });

  it("searches only what the operator may open and keeps wildcards literal", async () => {
    execute.mockResolvedValueOnce([
      { orders: [{ number: "GP-3284", status: "CONFIRMED", created_at: "" }], products: [] },
    ]);
    const results = await searchAdmin(" #gp 32_84% ", only("orders:manage"));
    const query = JSON.stringify(execute.mock.calls[0]?.[0]);
    expect(query).toContain("orders");
    expect(query).not.toContain("product_variants");
    expect(query).toContain("%GP32\\\\_84\\\\%%");
    expect(results.orders).toEqual([
      { orderNumber: "GP-3284", status: "CONFIRMED", href: "/admin/orders/GP-3284" },
    ]);
  });

  it("finds products by name or SKU", async () => {
    execute.mockResolvedValueOnce([
      {
        orders: [],
        products: [
          { id: "p1", name: "ATK X1", status: "PUBLISHED", sku: "ATK-X1-BLK", object_key: null },
        ],
      },
    ]);
    const results = await searchAdmin("atk-x1", only("catalog:manage"));
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain("pv.sku ILIKE");
    expect(results.products[0]).toMatchObject({ sku: "ATK-X1-BLK", href: "/admin/products/p1" });
  });
});

describe("admin endpoints", () => {
  it("answer without data when the visitor is not staff", async () => {
    vi.mocked(rbac.requireAdminAccess).mockRejectedValueOnce(
      new rbac.AuthenticationRequiredError()
    );
    const handler = vi.fn();
    const unauthenticated = await withAdminAccess(handler);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toBe("private, no-store");

    vi.mocked(rbac.requireAdminAccess).mockRejectedValueOnce(new rbac.ForbiddenError("no"));
    expect((await withAdminAccess(handler)).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("AdminSearch", () => {
  afterEach(() => vi.useRealTimers());

  it("opens with Ctrl+K and finds screens without accents", () => {
    render(<AdminSearch navItems={CANONICAL_ADMIN_NAV_ITEMS} />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    const dialog = screen.getByRole("dialog", { name: "Buscar en el panel" });
    const input = within(dialog).getByRole("combobox");
    fireEvent.change(input, { target: { value: "menu" } });
    expect(within(dialog).getByRole("option", { name: /Menú y navegación/ })).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/admin/menu");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks the server for orders and products after a short pause", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        orders: [{ orderNumber: "GP-3284", status: "CONFIRMED", href: "/admin/orders/GP-3284" }],
        products: [],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSearch navItems={CANONICAL_ADMIN_NAV_ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar pedidos, productos o secciones" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "GP-32" } });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/search?q=GP-32", expect.anything());
    expect(screen.getByRole("option", { name: /#GP-3284/ })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("AdminNotifications", () => {
  it("lists the pending work with a dot on the bell", () => {
    render(
      <AdminNotifications
        attention={{
          badges: { ordersToPrepare: 3, paymentsToReview: 0, outOfStock: 0, pendingReviews: 0 },
          items: [
            {
              id: "ordersToPrepare",
              count: 3,
              title: "pedidos por preparar",
              detail: "Pagados, listos para el envío",
              href: "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED",
              tone: "warning",
            },
          ],
        }}
      />
    );
    const bell = screen.getByRole("button", { name: "Notificaciones: 1 tareas pendientes" });
    fireEvent.click(bell);
    expect(screen.getByRole("link", { name: /3 pedidos por preparar/ }).getAttribute("href")).toBe(
      "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED"
    );
  });

  it("says when everything is done", () => {
    render(
      <AdminNotifications
        attention={{
          badges: { ordersToPrepare: 0, paymentsToReview: 0, outOfStock: 0, pendingReviews: 0 },
          items: [],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    expect(screen.getByText("Todo al día")).toBeTruthy();
  });
});
