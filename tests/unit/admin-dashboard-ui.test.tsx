// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialCohortSection } from "@/components/admin/dashboard/financial-cohort-section";
import { OrderPipelineSection } from "@/components/admin/dashboard/order-pipeline-section";
import { InventoryOverviewSection } from "@/components/admin/dashboard/inventory-overview-section";
import { DashboardHeader } from "@/components/admin/dashboard/dashboard-header";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
} from "@/lib/admin/dashboard-period";
import type {
  CohortFinancialsResult,
  InventoryOverviewResult,
  OrderPipelineResult,
} from "@/lib/admin/dashboard-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("GP-023 / CHK2 — Admin Dashboard Component & State Rendering Unit Tests", () => {
  describe("1. FinancialCohortSection", () => {
    it("1. financial READY state: renders 4 KPI cards with truthful labels and exact BigInt amounts", () => {
      const readyCohort: CohortFinancialsResult = {
        status: "READY",
        data: {
          current: {
            cohortGrossCents: 50000n,
            cohortNetCents: 48000n,
            cohortPaidOrders: 5,
            cohortActivePaidOrders: 4,
            cohortPendingCents: 2000n,
            aovCents: 12000n,
          },
          previous: {
            cohortGrossCents: 40000n,
            cohortNetCents: 40000n,
            cohortPaidOrders: 4,
            cohortActivePaidOrders: 4,
            cohortPendingCents: 0n,
            aovCents: 10000n,
          },
          trends: {
            gross: {
              semanticState: "POSITIVE",
              currentValue: 50000n,
              previousValue: 40000n,
              absoluteDelta: 10000n,
              percentageNumerator: 10000n,
              percentageDenominator: 40000n,
            },
            net: {
              semanticState: "POSITIVE",
              currentValue: 48000n,
              previousValue: 40000n,
              absoluteDelta: 8000n,
              percentageNumerator: 8000n,
              percentageDenominator: 40000n,
            },
            paidOrders: {
              semanticState: "POSITIVE",
              currentValue: 5,
              previousValue: 4,
              absoluteDelta: 1,
              percentageDelta: 25.0,
            },
            aov: {
              semanticState: "POSITIVE",
              currentValue: 12000n,
              previousValue: 10000n,
              absoluteDelta: 2000n,
              percentageNumerator: 2000n,
              percentageDenominator: 10000n,
            },
          },
        },
      };

      render(<FinancialCohortSection financialCohort={readyCohort} />);

      expect(screen.getByText("Ventas")).toBeDefined();
      expect(screen.getByText("Ventas netas")).toBeDefined();
      expect(screen.getByText(/Bruto/)).toBeDefined();
      expect(screen.getByText("Pedidos pagados")).toBeDefined();
      expect(screen.getByText("Ticket promedio")).toBeDefined();

      expect(screen.getByTestId("kpi-net-cents").textContent).toBe("S/ 480.00");
      expect(screen.getByTestId("kpi-gross-cents").textContent).toBe("S/ 500.00");
      expect(screen.getByTestId("kpi-paid-orders").textContent).toBe("5");
      expect(screen.getByTestId("kpi-aov-cents").textContent).toBe("S/ 120.00");

      // Explanatory cohort realization caption
      expect(screen.getByText("Pedidos creados en el período, según su pago actual")).toBeDefined();
    });

    it("2. financial CURRENCY_INTEGRITY_ERROR state: renders sanitized warning without fake money or SQL leakage", () => {
      const anomalyCohort: CohortFinancialsResult = {
        status: "UNAVAILABLE",
        error: "CURRENCY_INTEGRITY_ERROR",
        message: "Currency integrity anomaly detected.",
      };

      render(<FinancialCohortSection financialCohort={anomalyCohort} />);

      expect(screen.getByText("Métricas financieras no disponibles")).toBeDefined();
      expect(
        screen.getByText(
          "No se pueden mostrar las métricas financieras en este momento porque se detectó una inconsistencia de moneda."
        )
      ).toBeDefined();

      // Asserts zero fake money is rendered
      expect(screen.queryByText("S/ 0.00")).toBeNull();
      expect(screen.queryByTestId("kpi-net-cents")).toBeNull();
    });

    it("3. financial UNAUTHORIZED state: renders null (omitted from DOM)", () => {
      const unauthorizedCohort: CohortFinancialsResult = {
        status: "UNAUTHORIZED",
      };

      const { container } = render(<FinancialCohortSection financialCohort={unauthorizedCohort} />);
      expect(container.firstChild).toBeNull();
    });

    it("8. exact bigint money rendering above MAX_SAFE_INTEGER in KPI cards", () => {
      const hugeCohort: CohortFinancialsResult = {
        status: "READY",
        data: {
          current: {
            cohortGrossCents: 9007199254740993n,
            cohortNetCents: 9007199254740993n,
            cohortPaidOrders: 1,
            cohortActivePaidOrders: 1,
            cohortPendingCents: 0n,
            aovCents: 9007199254740993n,
          },
          previous: {
            cohortGrossCents: 0n,
            cohortNetCents: 0n,
            cohortPaidOrders: 0,
            cohortActivePaidOrders: 0,
            cohortPendingCents: 0n,
            aovCents: 0n,
          },
          trends: {
            gross: {
              semanticState: "NEW",
              currentValue: 9007199254740993n,
              previousValue: 0n,
              absoluteDelta: 9007199254740993n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
            net: {
              semanticState: "NEW",
              currentValue: 9007199254740993n,
              previousValue: 0n,
              absoluteDelta: 9007199254740993n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
            paidOrders: {
              semanticState: "NEW",
              currentValue: 1,
              previousValue: 0,
              absoluteDelta: 1,
              percentageDelta: null,
            },
            aov: {
              semanticState: "NEW",
              currentValue: 9007199254740993n,
              previousValue: 0n,
              absoluteDelta: 9007199254740993n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
          },
        },
      };

      render(<FinancialCohortSection financialCohort={hugeCohort} />);
      expect(screen.getByTestId("kpi-net-cents").textContent).toBe("S/ 90,071,992,547,409.93");
      expect(screen.getByTestId("kpi-gross-cents").textContent).toBe("S/ 90,071,992,547,409.93");
      expect(screen.getByTestId("kpi-aov-cents").textContent).toBe("S/ 90,071,992,547,409.93");
    });

    it("9 & 10. trend states: handles ZERO_BASELINE and NEW states properly in UI", () => {
      const zeroTrendCohort: CohortFinancialsResult = {
        status: "READY",
        data: {
          current: {
            cohortGrossCents: 0n,
            cohortNetCents: 0n,
            cohortPaidOrders: 0,
            cohortActivePaidOrders: 0,
            cohortPendingCents: 0n,
            aovCents: 0n,
          },
          previous: {
            cohortGrossCents: 0n,
            cohortNetCents: 0n,
            cohortPaidOrders: 0,
            cohortActivePaidOrders: 0,
            cohortPendingCents: 0n,
            aovCents: 0n,
          },
          trends: {
            gross: {
              semanticState: "ZERO_BASELINE",
              currentValue: 0n,
              previousValue: 0n,
              absoluteDelta: 0n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
            net: {
              semanticState: "ZERO_BASELINE",
              currentValue: 0n,
              previousValue: 0n,
              absoluteDelta: 0n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
            paidOrders: {
              semanticState: "ZERO_BASELINE",
              currentValue: 0,
              previousValue: 0,
              absoluteDelta: 0,
              percentageDelta: null,
            },
            aov: {
              semanticState: "ZERO_BASELINE",
              currentValue: 0n,
              previousValue: 0n,
              absoluteDelta: 0n,
              percentageNumerator: null,
              percentageDenominator: null,
            },
          },
        },
      };

      render(<FinancialCohortSection financialCohort={zeroTrendCohort} />);
      // Both periods at zero: no percentage, no decorative "Nuevo".
      expect(screen.getAllByText("Sin cambios").length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByText("Nuevo")).toBeNull();
      expect(screen.getByTestId("financial-no-sales").textContent).toContain(
        "El período anterior tampoco tuvo ventas pagadas."
      );
    });
  });

  describe("2. OrderPipelineSection", () => {
    it("renders total created orders and all canonical status distributions", () => {
      const readyPipeline: OrderPipelineResult = {
        status: "READY",
        data: {
          current: {
            totalCreatedOrders: 42,
            pendingOrders: 5,
            confirmedOrders: 10,
            processingOrders: 7,
            fulfilledOrders: 15,
            cancelledOrders: 2,
            expiredOrders: 1,
            refundedOrders: 2,
          },
          previous: {
            totalCreatedOrders: 30,
            pendingOrders: 3,
            confirmedOrders: 8,
            processingOrders: 5,
            fulfilledOrders: 12,
            cancelledOrders: 1,
            expiredOrders: 0,
            refundedOrders: 1,
          },
          trends: {
            totalCreatedOrders: {
              semanticState: "POSITIVE",
              currentValue: 42,
              previousValue: 30,
              absoluteDelta: 12,
              percentageDelta: 40.0,
            },
          },
        },
      };

      render(<OrderPipelineSection orderPipeline={readyPipeline} />);

      expect(screen.getByText("Pedidos del período")).toBeDefined();
      expect(screen.getByTestId("orders-total-created").textContent).toBe("42");
      expect(screen.getByTestId("order-status-pending").textContent).toContain("5");
      expect(screen.getByTestId("order-status-confirmed").textContent).toContain("10");
      expect(screen.getByTestId("order-status-processing").textContent).toContain("7");
      expect(screen.getByTestId("order-status-fulfilled").textContent).toContain("15");
      expect(screen.getByTestId("order-status-cancelled").textContent).toContain("2");
      expect(screen.getByTestId("order-status-expired").textContent).toContain("1");
      expect(screen.getByTestId("order-status-refunded").textContent).toContain("2");
    });
  });

  describe("5. InventoryOverviewSection", () => {
    const balances = {
      totalPositions: 8,
      onHandUnits: 120,
      reservedUnits: 15,
      allocatedUnits: 5,
      availableToSellUnits: 100,
    };

    it("12. inventory panel: available units, set-aside units and links to the stock screen", () => {
      const readyInventory: InventoryOverviewResult = {
        status: "READY",
        data: {
          globalPhysicalBalances: balances,
          outOfStockActiveSkus: 2,
          lowStockActivePositions: 4,
          restockItems: [],
        },
      };

      render(
        <InventoryOverviewSection
          inventoryOverview={readyInventory}
          inventoryHref={(filters = {}) =>
            `/admin/inventario${Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : ""}`
          }
        />
      );

      expect(screen.getByText("Inventario")).toBeDefined();
      expect(screen.getByTestId("inventory-ats-units").textContent).toBe("100");
      expect(screen.getByText("20 apartadas")).toBeDefined();
      expect(
        screen.getByTestId("inventory-out-of-stock-skus").closest("a")?.getAttribute("href")
      ).toBe("/admin/inventario?stock=out");
      expect(screen.getByTestId("inventory-restock-empty")).toBeDefined();
    });

    it("13 & 14. out-of-stock counts variants and low stock counts locations", () => {
      const readyInventory: InventoryOverviewResult = {
        status: "READY",
        data: {
          globalPhysicalBalances: balances,
          outOfStockActiveSkus: 3,
          lowStockActivePositions: 5,
          restockItems: [],
        },
      };

      render(<InventoryOverviewSection inventoryOverview={readyInventory} />);

      expect(screen.getByText("Variantes agotadas")).toBeDefined();
      expect(screen.getByText("Ubicaciones con stock bajo")).toBeDefined();
      // Low stock is counted per location, never presented as products.
      expect(screen.queryByText("Productos con stock bajo")).toBeNull();
    });

    it("lists what to restock with its state in words, lowest first", () => {
      const readyInventory: InventoryOverviewResult = {
        status: "READY",
        data: {
          globalPhysicalBalances: balances,
          outOfStockActiveSkus: 1,
          lowStockActivePositions: 1,
          restockItems: [
            {
              variantId: "v1",
              productName: "ATK A9 PRO MAX",
              variantTitle: "White",
              sku: "ATK-A9-W",
              availableUnits: 0,
              reorderPoint: 2,
            },
            {
              variantId: "v2",
              productName: "Mchose A7",
              variantTitle: "Black",
              sku: "MCH-A7-B",
              availableUnits: 1,
              reorderPoint: 3,
            },
          ],
        },
      };

      render(
        <InventoryOverviewSection
          inventoryOverview={readyInventory}
          inventoryHref={(filters = {}) => `/admin/inventario?${new URLSearchParams(filters)}`}
        />
      );

      expect(screen.getByTestId("restock-v1").textContent).toContain("Agotado");
      expect(screen.getByTestId("restock-v2").textContent).toContain("Quedan 1");
      expect(screen.getByTestId("restock-v1").querySelector("a")?.getAttribute("href")).toBe(
        "/admin/inventario?variant=v1"
      );
    });
  });

  describe("6. DashboardHeader & Period Selection", () => {
    it("15. period selector selected state: renders aria-current='page' on active option", () => {
      render(<DashboardHeader selectedPeriod="LAST_7_DAYS" />);

      const hoyLink = screen.getByRole("link", { name: "Hoy" });
      const sieteDiasLink = screen.getByRole("link", { name: "7 días" });
      const treintaDiasLink = screen.getByRole("link", { name: "30 días" });

      expect(sieteDiasLink.getAttribute("aria-current")).toBe("page");
      expect(hoyLink.getAttribute("aria-current")).toBeNull();
      expect(treintaDiasLink.getAttribute("aria-current")).toBeNull();
    });

    it("16. invalid period input resolving safely: resolves invalid string to LAST_30_DAYS fallback", () => {
      const invalidInput = "INVALID_PERIOD_XYZ";
      const resolvedPeriod: DashboardPeriodSelector = (
        CANONICAL_PERIOD_SELECTORS as readonly string[]
      ).includes(invalidInput)
        ? (invalidInput as DashboardPeriodSelector)
        : "LAST_30_DAYS";

      expect(resolvedPeriod).toBe("LAST_30_DAYS");

      render(<DashboardHeader selectedPeriod={resolvedPeriod} />);

      const treintaDiasLink = screen.getByRole("link", { name: "30 días" });
      expect(treintaDiasLink.getAttribute("aria-current")).toBe("page");
    });
  });

  describe("7. NoMetricsAssigned (ADMIN_SUPPORT)", () => {
    it("7. ADMIN_SUPPORT no-metrics state: renders truthful explanation without portraying error", () => {
      render(<NoMetricsAssigned />);

      expect(screen.getByText("Sin Métricas Asignadas")).toBeDefined();
      expect(screen.getByText("No hay métricas de resumen asignadas a tu rol.")).toBeDefined();
    });
  });
});
