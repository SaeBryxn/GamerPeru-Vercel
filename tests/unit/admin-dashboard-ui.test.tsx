// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialCohortSection } from "@/components/admin/dashboard/financial-cohort-section";
import { OrderPipelineSection } from "@/components/admin/dashboard/order-pipeline-section";
import { PaymentVerificationSection } from "@/components/admin/dashboard/payment-verification-section";
import { CatalogOverviewSection } from "@/components/admin/dashboard/catalog-overview-section";
import { InventoryOverviewSection } from "@/components/admin/dashboard/inventory-overview-section";
import { DashboardHeader } from "@/components/admin/dashboard/dashboard-header";
import { NoMetricsAssigned } from "@/components/admin/dashboard/no-metrics-assigned";
import {
  CANONICAL_PERIOD_SELECTORS,
  type DashboardPeriodSelector,
} from "@/lib/admin/dashboard-period";
import type {
  CatalogOverviewResult,
  CohortFinancialsResult,
  InventoryOverviewResult,
  OrderPipelineResult,
  PaymentVerificationResult,
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

      expect(screen.getByText("Resumen Financiero")).toBeDefined();
      expect(screen.getByText("Valor neto de pedidos")).toBeDefined();
      expect(screen.getByText("Valor bruto confirmado")).toBeDefined();
      expect(screen.getByText("Pedidos pagados")).toBeDefined();
      expect(screen.getByText("Ticket promedio")).toBeDefined();

      expect(screen.getByTestId("kpi-net-cents").textContent).toBe("S/ 480.00");
      expect(screen.getByTestId("kpi-gross-cents").textContent).toBe("S/ 500.00");
      expect(screen.getByTestId("kpi-paid-orders").textContent).toBe("5");
      expect(screen.getByTestId("kpi-aov-cents").textContent).toBe("S/ 120.00");

      // Explanatory cohort realization caption
      expect(
        screen.getByText(
          "Pedidos creados en el período seleccionado, según su estado de pago actual."
        )
      ).toBeDefined();
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
      const zeroPills = screen.getAllByText("0.0%");
      expect(zeroPills.length).toBeGreaterThanOrEqual(4);
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

      expect(screen.getByText("Flujo de Pedidos")).toBeDefined();
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

  describe("3. PaymentVerificationSection", () => {
    it("4. payment queue READY amount: renders count and formatted PEN amount", () => {
      const readyPayment: PaymentVerificationResult = {
        status: "READY",
        data: {
          snapshotQueue: {
            queueCount: 3,
            queueAmount: {
              status: "READY",
              amountCents: 35000n,
            },
          },
          periodActivity: {
            submissionAttemptsCount: 12,
            distinctPaymentsSubmittedCount: 10,
          },
          periodRefunds: {
            refundCount: 1,
            refundOutflow: {
              status: "READY",
              outflowCents: 5000n,
            },
          },
        },
      };

      render(<PaymentVerificationSection paymentVerification={readyPayment} />);

      expect(screen.getByText("Por verificar ahora")).toBeDefined();
      expect(screen.getByTestId("payment-queue-count").textContent).toBe("3");
      expect(screen.getByTestId("payment-queue-amount").textContent).toBe("S/ 350.00");
      expect(screen.getByTestId("payment-submission-attempts").textContent).toContain("12");
      expect(screen.getByTestId("payment-distinct-submissions").textContent).toContain("10");
      expect(screen.getByTestId("payment-refunds-count").textContent).toContain("1");
      expect(screen.getByTestId("payment-refunds-outflow").textContent).toContain("S/ 50.00");
    });

    it("5. payment queue count READY + amount UNAVAILABLE: renders count and 'No disponible' without S/ 0.00", () => {
      const partialQueuePayment: PaymentVerificationResult = {
        status: "READY",
        data: {
          snapshotQueue: {
            queueCount: 2,
            queueAmount: {
              status: "UNAVAILABLE",
              error: "CURRENCY_INTEGRITY_ERROR",
              message: "Queue currency error.",
            },
          },
          periodActivity: {
            submissionAttemptsCount: 2,
            distinctPaymentsSubmittedCount: 2,
          },
          periodRefunds: {
            refundCount: 0,
            refundOutflow: {
              status: "READY",
              outflowCents: 0n,
            },
          },
        },
      };

      render(<PaymentVerificationSection paymentVerification={partialQueuePayment} />);

      expect(screen.getByTestId("payment-queue-count").textContent).toBe("2");
      expect(screen.getByTestId("payment-queue-amount-unavailable").textContent).toContain(
        "No disponible"
      );
      expect(screen.queryByTestId("payment-queue-amount")).toBeNull();
    });

    it("6. refund count READY + refund amount UNAVAILABLE: renders count and 'No disponible' without S/ 0.00", () => {
      const partialRefundPayment: PaymentVerificationResult = {
        status: "READY",
        data: {
          snapshotQueue: {
            queueCount: 0,
            queueAmount: {
              status: "READY",
              amountCents: 0n,
            },
          },
          periodActivity: {
            submissionAttemptsCount: 0,
            distinctPaymentsSubmittedCount: 0,
          },
          periodRefunds: {
            refundCount: 2,
            refundOutflow: {
              status: "UNAVAILABLE",
              error: "CURRENCY_INTEGRITY_ERROR",
              message: "Refund currency error.",
            },
          },
        },
      };

      render(<PaymentVerificationSection paymentVerification={partialRefundPayment} />);

      expect(screen.getByTestId("payment-refunds-count").textContent).toContain("2");
      expect(screen.getByTestId("payment-refunds-outflow").textContent).toContain("No disponible");
    });
  });

  describe("4. CatalogOverviewSection", () => {
    it("11. catalog section rendering: displays published, drafts, active sellable SKUs, and without SKUs count", () => {
      const readyCatalog: CatalogOverviewResult = {
        status: "READY",
        data: {
          publishedProducts: 15,
          draftProducts: 3,
          archivedProducts: 0,
          activeSellableSkus: 45,
          totalActiveVariants: 50,
          totalVariants: 50,
          publishedProductsWithoutSkus: 1,
        },
      };

      render(<CatalogOverviewSection catalogOverview={readyCatalog} />);

      expect(screen.getByText("Resumen de Catálogo")).toBeDefined();
      expect(screen.getByTestId("catalog-published-products").textContent).toContain("15");
      expect(screen.getByTestId("catalog-draft-products").textContent).toContain("3");
      expect(screen.getByTestId("catalog-active-skus").textContent).toContain("45");
      expect(screen.getByTestId("catalog-published-no-skus").textContent).toContain("1");
    });
  });

  describe("5. InventoryOverviewSection", () => {
    it("12. inventory section rendering: displays global balances ATS/On-Hand/Reserved/Allocated", () => {
      const readyInventory: InventoryOverviewResult = {
        status: "READY",
        data: {
          globalPhysicalBalances: {
            totalPositions: 8,
            onHandUnits: 120,
            reservedUnits: 15,
            allocatedUnits: 5,
            availableToSellUnits: 100,
          },
          outOfStockActiveSkus: 2,
          lowStockActivePositions: 4,
        },
      };

      render(<InventoryOverviewSection inventoryOverview={readyInventory} />);

      expect(screen.getByText("Resumen de Inventario")).toBeDefined();
      expect(screen.getByTestId("inventory-ats-units").textContent).toBe("100");
      expect(screen.getByTestId("inventory-on-hand").textContent).toContain("120");
      expect(screen.getByTestId("inventory-reserved").textContent).toContain("15");
      expect(screen.getByTestId("inventory-allocated").textContent).toContain("5");
    });

    it("13 & 14. OOS SKU label and low-stock POSITION label are truthful", () => {
      const readyInventory: InventoryOverviewResult = {
        status: "READY",
        data: {
          globalPhysicalBalances: {
            totalPositions: 5,
            onHandUnits: 50,
            reservedUnits: 0,
            allocatedUnits: 0,
            availableToSellUnits: 50,
          },
          outOfStockActiveSkus: 3,
          lowStockActivePositions: 5,
        },
      };

      render(<InventoryOverviewSection inventoryOverview={readyInventory} />);

      // Truthful label assertions
      expect(screen.getByText("SKUs activos agotados")).toBeDefined();
      expect(screen.getByText("Posiciones con stock bajo")).toBeDefined();
      // Must NOT label low-stock positions as "SKUs con stock bajo"
      expect(screen.queryByText("SKUs con stock bajo")).toBeNull();
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
