import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard-period";
import { calculateAovCents, calculateMetricTrend } from "@/lib/admin/dashboard-metrics";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";
import * as rbac from "@/lib/auth/rbac";
import type * as RbacModule from "@/lib/auth/rbac";
import { db } from "@/db";

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof RbacModule>("@/lib/auth/rbac");
  return {
    ...actual,
    requireAdminAccess: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

const mockDbExecute = db.execute as unknown as ReturnType<typeof vi.fn>;

function getQueryText(query: unknown): string {
  try {
    return JSON.stringify(query);
  } catch {
    return String(query);
  }
}

describe("GP-023 / CHK1 — Admin Dashboard Reader Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Temporal Period Resolution (America/Lima UTC-5)", () => {
    it("1. TODAY period boundaries: local Lima 00:00:00 to tomorrow 00:00:00", () => {
      // 2026-09-02 01:15:00 UTC is 2026-09-01 20:15:00 Lima
      const now = new Date("2026-09-02T01:15:00.000Z");
      const period = resolveDashboardPeriod("TODAY", now);

      // Today in Lima is Sept 1, 2026
      expect(period.current.start.toISOString()).toBe("2026-09-01T05:00:00.000Z");
      expect(period.current.end.toISOString()).toBe("2026-09-02T05:00:00.000Z");
      // Previous is full day of Aug 31 in Lima
      expect(period.previous.start.toISOString()).toBe("2026-08-31T05:00:00.000Z");
      expect(period.previous.end.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    });

    it("2. LAST_7_DAYS boundaries: startOfTodayLima - 6 calendar days to now", () => {
      // 2026-09-02 12:00:00 UTC is 2026-09-02 07:00:00 Lima
      const now = new Date("2026-09-02T12:00:00.000Z");
      const period = resolveDashboardPeriod("LAST_7_DAYS", now);

      // Today in Lima is Sept 2. 6 days prior is Aug 27 at 00:00:00 Lima (05:00:00 UTC)
      expect(period.current.start.toISOString()).toBe("2026-08-27T05:00:00.000Z");
      expect(period.current.end.toISOString()).toBe("2026-09-02T12:00:00.000Z");

      const currDuration = period.current.end.getTime() - period.current.start.getTime();
      const prevDuration = period.previous.end.getTime() - period.previous.start.getTime();
      expect(prevDuration).toBe(currDuration);
      expect(period.previous.end.toISOString()).toBe("2026-08-27T05:00:00.000Z");
    });

    it("3. LAST_30_DAYS boundaries: startOfTodayLima - 29 calendar days to now", () => {
      const now = new Date("2026-09-02T12:00:00.000Z");
      const period = resolveDashboardPeriod("LAST_30_DAYS", now);

      // Sept 2 - 29 days is Aug 4 at 00:00:00 Lima (05:00:00 UTC)
      expect(period.current.start.toISOString()).toBe("2026-08-04T05:00:00.000Z");
      expect(period.current.end.toISOString()).toBe("2026-09-02T12:00:00.000Z");

      const currDuration = period.current.end.getTime() - period.current.start.getTime();
      const prevDuration = period.previous.end.getTime() - period.previous.start.getTime();
      expect(prevDuration).toBe(currDuration);
      expect(period.previous.end.toISOString()).toBe("2026-08-04T05:00:00.000Z");
    });

    it("4. THIS_MONTH boundaries: 1st of month to now", () => {
      const now = new Date("2026-09-02T17:00:00.000Z"); // Sept 2 12:00 Lima
      const period = resolveDashboardPeriod("THIS_MONTH", now);

      expect(period.current.start.toISOString()).toBe("2026-09-01T05:00:00.000Z");
      expect(period.current.end.toISOString()).toBe("2026-09-02T17:00:00.000Z");
      expect(period.previous.start.toISOString()).toBe("2026-08-01T05:00:00.000Z");
      expect(period.previous.end.toISOString()).toBe("2026-08-02T17:00:00.000Z");
    });

    it("5. March 31 vs February clamping: strictly clamps at startOfCurrentMonthLima", () => {
      const now = new Date("2026-03-31T17:00:00.000Z"); // March 31 12:00 Lima
      const period = resolveDashboardPeriod("THIS_MONTH", now);

      expect(period.current.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
      expect(period.previous.start.toISOString()).toBe("2026-02-01T05:00:00.000Z");
      // Clamped at Feb exclusive boundary: March 1 00:00 Lima (2026-03-01T05:00:00.000Z)
      expect(period.previous.end.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    });

    it("6. May 31 vs April clamping: strictly clamps at May 1 00:00 Lima", () => {
      const now = new Date("2026-05-31T17:00:00.000Z"); // May 31 12:00 Lima
      const period = resolveDashboardPeriod("THIS_MONTH", now);

      expect(period.current.start.toISOString()).toBe("2026-05-01T05:00:00.000Z");
      expect(period.previous.start.toISOString()).toBe("2026-04-01T05:00:00.000Z");
      // April has 30 days. May 31 elapsed is ~30.5 days. Clamped at April exclusive boundary (May 1 00:00 Lima)
      expect(period.previous.end.toISOString()).toBe("2026-05-01T05:00:00.000Z");
    });

    it("7. Half-open boundary semantics: never uses 23:59:59.999", () => {
      const now = new Date("2026-09-02T12:00:00.000Z");
      for (const sel of ["TODAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH"] as const) {
        const period = resolveDashboardPeriod(sel, now);
        expect(period.current.start.getMilliseconds()).toBe(0);
        expect(period.previous.start.getMilliseconds()).toBe(0);
        expect(period.current.end.toISOString()).not.toContain("23:59:59.999");
        expect(period.previous.end.toISOString()).not.toContain("23:59:59.999");
      }
    });

    it("8. One captured now drives the entire request", () => {
      const staticNow = new Date("2026-09-02T10:20:30.400Z");
      const period = resolveDashboardPeriod("LAST_7_DAYS", staticNow);
      expect(period.referenceNow).toBe(staticNow);
      expect(period.current.end).toBe(staticNow);
    });
  });

  describe("2. AOV Precision & Deterministic Cent Rounding (ROUND HALF UP)", () => {
    it("9. AOV 100 cents / 3 orders => 33 cents (S/ 0.33)", () => {
      expect(calculateAovCents(100n, 3n)).toBe(33n);
    });

    it("10. AOV 101 cents / 2 orders => 51 cents (S/ 0.51, ties at 0.5 round up)", () => {
      expect(calculateAovCents(101n, 2n)).toBe(51n);
    });

    it("11. AOV 100 cents / 2 orders => 50 cents (S/ 0.50)", () => {
      expect(calculateAovCents(100n, 2n)).toBe(50n);
    });

    it("12. AOV 1 cent / 2 orders => 1 cent (S/ 0.01, exact 0.5 rounds up to 1)", () => {
      expect(calculateAovCents(1n, 2n)).toBe(1n);
    });

    it("13. AOV denominator 0 => 0 cents (S/ 0.00, prevents division by zero)", () => {
      expect(calculateAovCents(100n, 0n)).toBe(0n);
      expect(calculateAovCents(0n, 0n)).toBe(0n);
    });

    it("14. No floating-point authoritative AOV path: computes purely with BigInt", () => {
      const hugeNet = 900719925474099100n; // Exceeds safe JS integer
      const orders = 3n;
      const result = calculateAovCents(hugeNet, orders);
      expect(result).toBe(300239975158033033n);
    });
  });

  describe("3. Trend Semantics & Zero-Baseline Behavior", () => {
    it("15. previous = 0 and current = 0 => delta = 0, percentage = 0, semanticState = ZERO_BASELINE", () => {
      const trend = calculateMetricTrend(0, 0);
      expect(trend.absoluteDelta).toBe(0);
      expect(trend.percentageDelta).toBe(0);
      expect(trend.semanticState).toBe("ZERO_BASELINE");
    });

    it("16. previous = 0 and current > 0 => percentage = null, semanticState = NEW (never +100% or Infinity)", () => {
      const trend = calculateMetricTrend(150, 0);
      expect(trend.absoluteDelta).toBe(150);
      expect(trend.percentageDelta).toBeNull();
      expect(trend.semanticState).toBe("NEW");
    });
  });

  describe("4. Permission-Aware Execution & Security Boundaries", () => {
    it("17. Financial capability for ADMIN_ORDERS: queries financial and orders, not catalog or inventory", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:manage", "orders:verify"]),
      });

      mockDbExecute.mockImplementation(async () => [] as never);

      const payload = await getAdminDashboardData();

      expect(payload.financialCohort.status).toBe("READY");
      expect(payload.orderPipeline.status).toBe("READY");
      expect(payload.paymentVerification.status).toBe("READY");
      expect(payload.catalogOverview.status).toBe("UNAUTHORIZED");
      expect(payload.inventoryOverview.status).toBe("UNAUTHORIZED");
    });

    it("18. Catalog capability for ADMIN_CATALOG: queries catalog, not financial, orders, or inventory", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-catalog",
        email: "catalog@gamerperu.pe",
        roles: ["ADMIN_CATALOG"],
        permissions: new Set(["catalog:manage", "catalog:publish"]),
      });

      mockDbExecute.mockImplementation(async () => [] as never);

      const payload = await getAdminDashboardData();

      expect(payload.financialCohort.status).toBe("UNAUTHORIZED");
      expect(payload.orderPipeline.status).toBe("UNAUTHORIZED");
      expect(payload.paymentVerification.status).toBe("UNAUTHORIZED");
      expect(payload.catalogOverview.status).toBe("READY");
      expect(payload.inventoryOverview.status).toBe("UNAUTHORIZED");
    });

    it("19. Inventory capability only where canonical inventory:manage exists", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-super-admin",
        email: "admin@gamerperu.pe",
        roles: ["SUPER_ADMIN"],
        permissions: new Set([
          "staff:manage",
          "catalog:manage",
          "catalog:publish",
          "orders:manage",
          "orders:verify",
          "inventory:manage",
        ]),
      });

      mockDbExecute.mockImplementation(async () => [] as never);

      const payload = await getAdminDashboardData();

      expect(payload.inventoryOverview.status).toBe("READY");
    });

    it("20. ADMIN_SUPPORT receives no unauthorized GP-023 metric values (all UNAUTHORIZED, 0 queries run)", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-support",
        email: "support@gamerperu.pe",
        roles: ["ADMIN_SUPPORT"],
        permissions: new Set(["support:manage", "support:review_rma"]),
      });

      const payload = await getAdminDashboardData();

      // Zero privileged DB queries should have been dispatched
      expect(db.execute).not.toHaveBeenCalled();

      expect(payload.financialCohort.status).toBe("UNAUTHORIZED");
      expect(payload.orderPipeline.status).toBe("UNAUTHORIZED");
      expect(payload.paymentVerification.status).toBe("UNAUTHORIZED");
      expect(payload.catalogOverview.status).toBe("UNAUTHORIZED");
      expect(payload.inventoryOverview.status).toBe("UNAUTHORIZED");
    });

    it("21. CUSTOMER admin access fails closed with ForbiddenError", async () => {
      vi.mocked(rbac.requireAdminAccess).mockRejectedValue(
        new rbac.ForbiddenError("No tienes permisos de personal para acceder a la administración.")
      );

      await expect(getAdminDashboardData()).rejects.toThrow(rbac.ForbiddenError);
    });

    it("22. RBAC ERROR fails closed with AuthorizationUnavailableError", async () => {
      vi.mocked(rbac.requireAdminAccess).mockRejectedValue(
        new rbac.AuthorizationUnavailableError()
      );

      await expect(getAdminDashboardData()).rejects.toThrow(rbac.AuthorizationUnavailableError);
    });
  });

  describe("5. Currency Integrity Enforcement (Fail-Closed)", () => {
    it("23. Currency-integrity READY case: all rows PEN + PEN", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-super-admin",
        email: "admin@gamerperu.pe",
        roles: ["SUPER_ADMIN"],
        permissions: new Set(["orders:manage", "orders:verify"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("cohort_gross_cents")) {
          return [
            {
              total_created_orders: "10",
              currency_anomaly_count: "0",
              cohort_paid_orders: "5",
              cohort_active_paid_orders: "5",
              cohort_gross_cents: "50000",
              cohort_net_cents: "48000",
              cohort_pending_cents: "2000",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.financialCohort.status).toBe("READY");
      if (payload.financialCohort.status === "READY") {
        expect(payload.financialCohort.data.current.cohortGrossCents).toBe(50000);
        expect(payload.financialCohort.data.current.cohortNetCents).toBe(48000);
        expect(payload.financialCohort.data.current.aovCents).toBe(9600); // 48000 / 5
      }
    });

    it("24. PEN Order + USD Payment: financial metrics fail closed to CURRENCY_INTEGRITY_ERROR", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:manage", "orders:verify"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("cohort_gross_cents")) {
          return [
            {
              total_created_orders: "10",
              currency_anomaly_count: "1", // 1 anomaly
              cohort_paid_orders: "5",
              cohort_active_paid_orders: "5",
              cohort_gross_cents: "50000",
              cohort_net_cents: "48000",
              cohort_pending_cents: "2000",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.financialCohort.status).toBe("UNAVAILABLE");
      if (payload.financialCohort.status === "UNAVAILABLE") {
        expect(payload.financialCohort.error).toBe("CURRENCY_INTEGRITY_ERROR");
      }
    });

    it("25. USD Order + USD Payment: financial metrics fail closed to CURRENCY_INTEGRITY_ERROR", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:manage", "orders:verify"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("cohort_gross_cents")) {
          return [
            {
              total_created_orders: "5",
              currency_anomaly_count: "2",
              cohort_paid_orders: "2",
              cohort_active_paid_orders: "2",
              cohort_gross_cents: "20000",
              cohort_net_cents: "20000",
              cohort_pending_cents: "0",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.financialCohort.status).toBe("UNAVAILABLE");
    });

    it("26. Missing Payment does not erase total created orders count", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:manage"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("pending_orders")) {
          return [
            {
              total_created_orders: "15",
              pending_orders: "5",
              confirmed_orders: "4",
              processing_orders: "2",
              fulfilled_orders: "2",
              cancelled_orders: "1",
              expired_orders: "1",
              refunded_orders: "0",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.orderPipeline.status).toBe("READY");
      if (payload.orderPipeline.status === "READY") {
        expect(payload.orderPipeline.data.current.totalCreatedOrders).toBe(15);
      }
    });

    it("27. Queue amount unavailable under currency anomaly while queue count remains usable", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:verify"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("queue_count")) {
          return [
            {
              queue_count: "5",
              queue_currency_anomaly_count: "1",
              queue_amount_cents: "20000",
            },
          ] as never;
        }
        if (text.includes("submission_attempts_count")) {
          return [
            {
              submission_attempts_count: "12",
              distinct_payments_count: "5",
            },
          ] as never;
        }
        if (text.includes("refund_currency_anomaly_count")) {
          return [
            {
              refund_count: "0",
              refund_currency_anomaly_count: "0",
              refund_outflow_cents: "0",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.paymentVerification.status).toBe("READY");
      if (payload.paymentVerification.status === "READY") {
        const queue = payload.paymentVerification.data.snapshotQueue;
        expect(queue.queueCount).toBe(5); // Queue count remains usable!
        expect(queue.queueAmount.status).toBe("UNAVAILABLE"); // Amount fails closed!
        if (queue.queueAmount.status === "UNAVAILABLE") {
          expect(queue.queueAmount.error).toBe("CURRENCY_INTEGRITY_ERROR");
        }
      }
    });

    it("28. Refund outflow unavailable under currency anomaly while refund count remains usable", async () => {
      vi.mocked(rbac.requireAdminAccess).mockResolvedValue({
        status: "READY",
        authUserId: "user-admin-orders",
        email: "orders@gamerperu.pe",
        roles: ["ADMIN_ORDERS"],
        permissions: new Set(["orders:verify"]),
      });

      mockDbExecute.mockImplementation(async (query: unknown) => {
        const text = getQueryText(query);
        if (text.includes("queue_count")) {
          return [
            {
              queue_count: "2",
              queue_currency_anomaly_count: "0",
              queue_amount_cents: "5000",
            },
          ] as never;
        }
        if (text.includes("submission_attempts_count")) {
          return [
            {
              submission_attempts_count: "2",
              distinct_payments_count: "2",
            },
          ] as never;
        }
        if (text.includes("refund_currency_anomaly_count")) {
          return [
            {
              refund_count: "3",
              refund_currency_anomaly_count: "1", // Anomaly in refund relation
              refund_outflow_cents: "9000",
            },
          ] as never;
        }
        return [] as never;
      });

      const payload = await getAdminDashboardData();

      expect(payload.paymentVerification.status).toBe("READY");
      if (payload.paymentVerification.status === "READY") {
        const refunds = payload.paymentVerification.data.periodRefunds;
        expect(refunds.refundCount).toBe(3);
        expect(refunds.refundOutflow.status).toBe("UNAVAILABLE");
        if (refunds.refundOutflow.status === "UNAVAILABLE") {
          expect(refunds.refundOutflow.error).toBe("CURRENCY_INTEGRITY_ERROR");
        }
      }
    });
  });
});
