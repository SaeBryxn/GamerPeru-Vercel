import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard-period";
import {
  bucketsOf,
  buildAttentionItems,
  buildCatalogHealthSummary,
  buildInventorySummary,
  buildStoreStatus,
  describeOrderStatus,
  describeTrend,
  fetchSalesOverview,
  fetchStoreSnapshot,
  formatSoles,
  type StoreSnapshot,
} from "@/lib/admin/dashboard-overview";
import type { PermissionName } from "@/lib/auth/rbac";

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const execute = db.execute as unknown as ReturnType<typeof vi.fn>;
const canAll = () => true;
const only =
  (...permissions: PermissionName[]) =>
  (permission: PermissionName) =>
    permissions.includes(permission);

function queryText(query: unknown): string {
  return JSON.stringify(query);
}

// 2026-11-14 15:30 in Lima.
const NOW = new Date("2026-11-14T20:30:00.000Z");

beforeEach(() => {
  execute.mockReset();
});

describe("formatting", () => {
  it("shows whole soles with thousands separators", () => {
    expect(formatSoles(482_049n)).toBe("S/ 4,820");
    expect(formatSoles(17_250)).toBe("S/ 173");
    expect(formatSoles(0n)).toBe("S/ 0");
  });

  it("describes trends in whole percentages, with no infinity on a zero baseline", () => {
    expect(describeTrend(112n, 100n, "ayer")).toEqual({
      direction: "up",
      label: "12%",
      description: "12% más que ayer",
    });
    expect(describeTrend(96, 100, "ayer").direction).toBe("down");
    expect(describeTrend(5, 0, "ayer")).toMatchObject({ direction: "new", label: "Nuevo" });
    expect(describeTrend(0, 0, "ayer")).toMatchObject({ direction: "flat", label: "0%" });
  });
});

describe("period buckets", () => {
  it("draws «Hoy» by hour up to the current Lima hour", () => {
    const buckets = bucketsOf(resolveDashboardPeriod("TODAY", NOW));
    expect(buckets).toHaveLength(16);
    expect(buckets[0]).toEqual({ key: "2026-11-14T00", label: "00:00" });
    expect(buckets.at(-1)).toEqual({ key: "2026-11-14T15", label: "15:00" });
  });

  it("draws other periods by Lima calendar day, today included", () => {
    const buckets = bucketsOf(resolveDashboardPeriod("LAST_30_DAYS", NOW));
    expect(buckets).toHaveLength(30);
    expect(buckets[0]).toEqual({ key: "2026-10-16", label: "16 oct" });
    expect(buckets.at(-1)).toEqual({ key: "2026-11-14", label: "14 nov" });
    expect(bucketsOf(resolveDashboardPeriod("THIS_MONTH", NOW))).toHaveLength(14);
  });
});

describe("fetchSalesOverview", () => {
  const period = resolveDashboardPeriod("LAST_7_DAYS", NOW);
  const row = (overrides: Record<string, unknown>) => ({
    slot: "C",
    bucket: null,
    created_orders: 0,
    currency_anomalies: 0,
    paid_orders: 0,
    active_paid_orders: 0,
    net_cents: 0,
    profit_cents: null,
    costed_line_cents: 0,
    line_cents: 0,
    ...overrides,
  });

  it("feeds KPIs, sparklines and the chart from one query", async () => {
    execute.mockResolvedValueOnce([
      row({
        bucket: "2026-11-13",
        paid_orders: 2,
        active_paid_orders: 2,
        net_cents: 30_000,
        profit_cents: 9_000,
        costed_line_cents: 20_000,
        line_cents: 30_000,
      }),
      row({ bucket: "2026-11-14", paid_orders: 1, active_paid_orders: 1, net_cents: 15_000 }),
      row({
        slot: "P",
        paid_orders: 2,
        active_paid_orders: 2,
        net_cents: 40_000,
        profit_cents: 6_000,
      }),
    ]);

    const result = await fetchSalesOverview(period);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const { data } = result;
    expect(data.points).toHaveLength(7);
    expect(data.points.at(-2)).toMatchObject({
      key: "2026-11-13",
      netCents: 30_000,
      paidOrders: 2,
    });
    expect(data.points[0]).toMatchObject({ netCents: 0, paidOrders: 0, profitCents: null });
    expect(data.netSales).toMatchObject({ value: "S/ 450", previous: "S/ 400" });
    expect(data.netSales.trend).toMatchObject({ direction: "up", label: "13%" });
    expect(data.paidOrders).toMatchObject({ value: "3", previous: "2" });
    expect(data.averageTicket).toMatchObject({ value: "S/ 150", previous: "S/ 200" });
    expect(data.estimatedProfit).toMatchObject({ value: "S/ 90", previous: "S/ 60" });
    expect(data.profitCoverage).toBeCloseTo(20_000 / 30_000);
    expect(data.comparisonLabel).toBe("los 7 días anteriores");
  });

  it("hides the profit card when no sold line has a cost", async () => {
    execute.mockResolvedValueOnce([row({ bucket: "2026-11-14", paid_orders: 1, net_cents: 100 })]);
    const result = await fetchSalesOverview(period);
    expect(result.status === "READY" && result.data.estimatedProfit).toBeNull();
  });

  it("fails closed on money in another currency", async () => {
    execute.mockResolvedValueOnce([row({ slot: "P", currency_anomalies: 1 })]);
    expect((await fetchSalesOverview(period)).status).toBe("UNAVAILABLE");
  });
});

describe("fetchStoreSnapshot", () => {
  it("queries only the sections the operator may see", async () => {
    execute.mockResolvedValueOnce([
      {
        to_prepare: { n: 3, oldest: null },
        payments: null,
        pending_reviews: null,
        catalog: null,
        menu: null,
      },
    ]);
    const snapshot = await fetchStoreSnapshot(only("orders:manage"));
    const text = queryText(execute.mock.calls[0]?.[0]);
    expect(text).toContain("shipments");
    expect(text).not.toContain("payment_submissions");
    expect(text).not.toContain("product_reviews");
    expect(text).not.toContain("inventory_items");
    expect(snapshot).toMatchObject({
      toPrepare: { count: 3 },
      payments: null,
      catalog: null,
      menu: null,
    });
  });

  it("counts visible menu entries with the configured defaults", async () => {
    execute.mockResolvedValueOnce([
      {
        to_prepare: null,
        payments: null,
        pending_reviews: "4",
        catalog: null,
        menu: [["mouses", false]],
      },
    ]);
    const snapshot = await fetchStoreSnapshot(only("catalog:manage"));
    expect(snapshot.pendingReviews).toBe(4);
    expect(snapshot.menu!.total).toBeGreaterThan(1);
    expect(snapshot.menu!.visible).toBeLessThan(snapshot.menu!.total);
  });
});

const catalog: NonNullable<StoreSnapshot["catalog"]> = {
  published: 40,
  withPhoto: 38,
  withPrice: 39,
  withDescription: 40,
  withStory: 36,
  complete: 34,
  withoutPrice: 1,
  withoutPhoto: 2,
  outOfStock: 8,
  lowStock: 12,
  available: 20,
};
const snapshot: StoreSnapshot = {
  toPrepare: { count: 3, oldest: "2026-11-14T15:00:00.000Z" },
  payments: { count: 2, oldest: "2026-11-14T18:30:00.000Z", stale: 0 },
  pendingReviews: 5,
  catalog,
  menu: { visible: 6, total: 8 },
};

describe("Por atender", () => {
  it("lists real work, most urgent first, each with its exact filter", () => {
    const items = buildAttentionItems(snapshot, canAll, NOW);
    expect(items.map((item) => [item.id, item.count, item.href])).toEqual([
      ["payments", 2, "/admin/pagos"],
      ["ordersToPrepare", 3, "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED"],
      ["publishedWithoutPrice", 1, "/admin/products?status=PUBLISHED&pending=price"],
      ["publishedWithoutStock", 8, "/admin/products?status=PUBLISHED&pending=stock"],
      ["pendingReviews", 5, "/admin/resenas"],
      ["publishedWithoutPhoto", 2, "/admin/products?status=PUBLISHED&pending=media"],
    ]);
    expect(items[0]!.detail).toBe("Yape/Plin · el más antiguo hace 2 h");
  });

  it("drops zero counts and screens the operator cannot open", () => {
    const quiet: StoreSnapshot = {
      ...snapshot,
      payments: { count: 0, oldest: null, stale: 0 },
      pendingReviews: 0,
    };
    const items = buildAttentionItems(quiet, only("orders:manage", "inventory:manage"), NOW);
    // Without catalog:manage the stock row leads to the inventory instead of the product list.
    expect(items.map((item) => [item.id, item.href])).toEqual([
      ["ordersToPrepare", "/admin/orders?orderStatus=CONFIRMED&shipmentStatus=UNFULFILLED"],
      ["publishedWithoutStock", "/admin/inventario?stock=out"],
    ]);
  });
});

describe("summary cards", () => {
  it("summarizes inventory by product, only with inventory access", () => {
    expect(buildInventorySummary(snapshot, canAll)).toEqual({
      outOfStock: { count: 8, href: "/admin/products?status=PUBLISHED&pending=stock" },
      lowStock: { count: 12, href: "/admin/inventario?stock=low" },
      available: { count: 20, href: "/admin/inventario" },
    });
    expect(buildInventorySummary(snapshot, only("catalog:manage"))).toBeNull();
  });

  it("scores catalog health on published listings", () => {
    const health = buildCatalogHealthSummary(snapshot, canAll)!;
    expect(health).toMatchObject({ publishedProducts: 40, score: 85, rating: "Bueno" });
    expect(health.checks.map((check) => [check.label, check.percent, check.href])).toEqual([
      ["Con foto principal", 95, "/admin/products?status=PUBLISHED&pending=media"],
      ["Con precio", 98, "/admin/products?status=PUBLISHED&pending=price"],
      ["Con descripción", 100, null],
      ["Con página publicada", 90, null],
    ]);
  });

  it("reports only computable store facts, flagging what needs attention", () => {
    const status = buildStoreStatus(
      { ...snapshot, payments: { count: 2, oldest: null, stale: 1 } },
      {
        status: "READY",
        data: { total: 10, visible: 9, hidden: 1, neverEdited: 0, emptyImageSlots: 0, invalid: 0 },
      },
      canAll
    )!;
    expect(status.allClear).toBe(false);
    expect(status.rows.map((row) => [row.label, row.value, row.tone])).toEqual([
      ["Página de inicio", "9 de 10 visibles", "success"],
      ["Menú y navegación", "6 secciones visibles", "success"],
      ["Productos publicados", "40", "success"],
      ["Publicados incompletos", "6", "danger"],
      ["Pagos en espera", "1 con más de 24 h", "warning"],
    ]);
    expect(status.rows.some((row) => /operativ/i.test(row.value))).toBe(false);
  });
});

describe("order badges", () => {
  it("names the next step of each order", () => {
    expect(describeOrderStatus("CONFIRMED", "PAID", "UNFULFILLED")).toEqual({
      label: "Por preparar",
      tone: "warning",
    });
    expect(describeOrderStatus("PROCESSING", "PAID", "SHIPPED").label).toBe("Enviado");
    expect(describeOrderStatus("FULFILLED", "PAID", "DELIVERED").label).toBe("Entregado");
    expect(describeOrderStatus("PENDING", "SUBMITTED", null).label).toBe("Por validar pago");
    expect(describeOrderStatus("CANCELLED", "UNPAID", null)).toEqual({
      label: "Cancelado",
      tone: "danger",
    });
  });
});
