// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard-period";
import type { DashboardOverview } from "@/lib/admin/dashboard-overview";
import type { SalesOverview } from "@/lib/admin/dashboard-overview-types";
import AdminDashboardPage from "@/app/admin/(protected)/page";
import { getDashboardOverview } from "@/lib/admin/dashboard-overview";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerMocks.refresh }) }));
vi.mock("@/lib/admin/dashboard-overview", () => ({ getDashboardOverview: vi.fn() }));

const trend = { direction: "up" as const, label: "12%", description: "12% más que ayer" };
const kpi = (value: string, previous: string) => ({ value, previous, trend });

const sales: SalesOverview = {
  granularity: "hour",
  points: [
    { key: "2026-11-14T00", label: "00:00", netCents: 0, paidOrders: 0, profitCents: null },
    { key: "2026-11-14T01", label: "01:00", netCents: 42_800, paidOrders: 2, profitCents: 9_000 },
  ],
  comparisonLabel: "ayer",
  netSales: kpi("S/ 4,820", "S/ 4,290"),
  paidOrders: kpi("28", "24"),
  averageTicket: kpi("S/ 172", "S/ 179"),
  estimatedProfit: kpi("S/ 1,420", "S/ 1,230"),
  profitCoverage: 0.8,
};

function overview(overrides: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    period: resolveDashboardPeriod("TODAY", new Date("2026-11-14T20:30:00.000Z")),
    actor: { displayRoles: ["SUPER_ADMIN"] },
    sales: { status: "READY", data: sales },
    topProducts: {
      status: "READY",
      data: [
        {
          productId: "p1",
          name: "ATK X1 Pro Max",
          imageUrl: null,
          units: 245,
          revenue: "S/ 2,990",
          trend,
          href: "/admin/products/p1",
        },
      ],
    },
    recentOrders: {
      status: "READY",
      data: [
        {
          orderNumber: "GP-3284",
          customer: "Carlos Mendoza",
          imageUrl: null,
          products: "2 productos",
          total: "S/ 428",
          status: { label: "Por preparar", tone: "warning" },
          createdAt: "2026-11-14T16:52:00.000Z",
          createdLabel: "Hoy, 11:52",
          href: "/admin/orders/GP-3284",
        },
      ],
    },
    attention: [
      {
        id: "ordersToPrepare",
        count: 3,
        title: "pedidos por preparar",
        detail: "Pagados, listos para el envío",
        href: "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED",
        tone: "warning",
      },
    ],
    inventory: {
      outOfStock: { count: 8, href: "/admin/products?status=PUBLISHED&pending=stock" },
      lowStock: { count: 12, href: "/admin/inventario?stock=low" },
      available: { count: 43, href: "/admin/inventario" },
    },
    catalogHealth: {
      publishedProducts: 50,
      score: 92,
      rating: "Excelente",
      checks: [{ label: "Con foto principal", percent: 96, href: null }],
    },
    storeStatus: {
      allClear: true,
      rows: [
        {
          label: "Menú y navegación",
          value: "6 secciones visibles",
          tone: "success",
          href: "/admin/menu",
        },
      ],
    },
    ...overrides,
  };
}

describe("Inicio", () => {
  it("follows the reference: KPIs, chart and queue, status cards, then lists", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(overview());
    render(await AdminDashboardPage({}));

    expect(vi.mocked(getDashboardOverview)).toHaveBeenLastCalledWith({ periodSelector: "TODAY" });
    expect(screen.getByRole("heading", { level: 1, name: "Resumen de la tienda" })).toBeTruthy();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
    ).toEqual([
      "Ventas netas",
      "Pedidos",
      "Ticket promedio",
      "Utilidad estimada",
      "Ventas del período",
      "Por atender",
      "Inventario",
      "Salud del catálogo",
      "Estado de la tienda",
      "Top productos",
      "Pedidos recientes",
    ]);
    expect(screen.getByText("vs. S/ 4,290 ayer")).toBeTruthy();
    expect(
      screen.getByText("Calculada sobre el 80% de las ventas con costo registrado")
    ).toBeTruthy();
  });

  it("keeps each period in the URL", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(overview());
    render(await AdminDashboardPage({ searchParams: Promise.resolve({ period: "LAST_7_DAYS" }) }));
    const tabs = screen.getByRole("navigation", { name: "Período del resumen" });
    expect(within(tabs).getByRole("link", { name: "Hoy" }).getAttribute("href")).toBe("/admin");
    expect(within(tabs).getByRole("link", { name: "7 días" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(within(tabs).getByRole("link", { name: "Este mes" }).getAttribute("href")).toBe(
      "/admin?period=THIS_MONTH"
    );
  });

  it("sends each pending task to its exact filter", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(overview());
    render(await AdminDashboardPage({}));
    const queue = screen.getByRole("heading", { name: "Por atender" }).closest("section")!;
    expect(
      within(queue)
        .getByRole("link", { name: /3\s*pedidos por preparar/ })
        .getAttribute("href")
    ).toBe("/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED");
    expect(screen.getByRole("link", { name: /#GP-3284/ }).getAttribute("href")).toBe(
      "/admin/orders/GP-3284"
    );
  });

  it("shows only the cards a catalog account may see, without sales", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(
      overview({
        sales: { status: "UNAUTHORIZED" },
        topProducts: { status: "UNAUTHORIZED" },
        recentOrders: { status: "UNAUTHORIZED" },
        inventory: null,
      })
    );
    render(await AdminDashboardPage({}));
    expect(screen.queryByRole("navigation", { name: "Período del resumen" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ventas netas" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Inventario" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Salud del catálogo" })).toBeTruthy();
  });

  it("tells an account with no overview where to go instead", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(
      overview({
        sales: { status: "UNAUTHORIZED" },
        topProducts: { status: "UNAUTHORIZED" },
        recentOrders: { status: "UNAUTHORIZED" },
        attention: null,
        inventory: null,
        catalogHealth: null,
        storeStatus: null,
      })
    );
    render(await AdminDashboardPage({}));
    expect(screen.getByRole("heading", { name: /Sin Métricas Asignadas/i })).toBeTruthy();
  });

  it("refreshes the numbers in place", async () => {
    routerMocks.refresh.mockClear();
    vi.mocked(getDashboardOverview).mockResolvedValue(overview());
    render(await AdminDashboardPage({}));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("explains a closed sales section instead of showing wrong numbers", async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(
      overview({ sales: { status: "UNAVAILABLE", message: "Hay pagos en otra moneda." } })
    );
    render(await AdminDashboardPage({}));
    expect(screen.getByRole("alert").textContent).toContain("Hay pagos en otra moneda.");
    expect(screen.queryByRole("heading", { name: "Ventas del período" })).toBeNull();
  });
});
